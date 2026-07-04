from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io, uuid
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.branch_scope import effective_branch_id, ensure_branch_access, enforce_branch_on_create, BRANCH_LEVEL_ROLES
from app.utils.sequences import generate_document_number, get_branch_code
from app.models.purchase_invoice import (
    PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceResponse,
    PurchasePaymentCreate, PurchasePaymentResponse,
    ConfirmInvoiceItemPayload, ConfirmReturnItemPayload,
)
from app.utils.stock_log import log_inventory
from app.utils.return_stock import deduct_return_stock
from app.utils.inventory_stock import (
    batch_qty, set_batch_qty, inventory_totals,
    find_inventory_with_batch, find_or_create_inventory, resolve_basic_sku_count,
)
from app.utils.treasury_posting import _create_cash_transaction, _create_bank_transaction
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/purchases", tags=["Purchase Invoices"])

PURCHASE_INVOICE_SORT_FIELDS = {
    "created_at", "updated_at", "invoice_date", "invoice_number",
    "supplier_name", "status", "payment_status", "total_amount", "net_amount",
    "due_date",
}


def _resolve_supplier(db, supplier_id: str, channel_id: str) -> tuple[str, str, int]:
    """Return (supplier_name, channel_name, credit_term_days)."""
    supplier_doc = db[Collections.SUPPLIERS].find_one({"_id": supplier_id})
    if not supplier_doc:
        return "", "", 30
    supplier_name    = supplier_doc.get("name", supplier_doc.get("short_name", ""))
    channel_name     = ""
    credit_term_days = 30
    channels = supplier_doc.get("channels", []) + supplier_doc.get("distributor_channels", []) + supplier_doc.get("agency_channels", [])
    for ch in channels:
        if str(ch.get("id", "")) == channel_id:
            channel_name     = ch.get("channel_name", "")
            credit_term_days = ch.get("credit_term_days", 30)
            break
    return supplier_name, channel_name, credit_term_days


def _compute_amounts(payload_dict: dict) -> tuple[list, list, float, float]:
    """Compute item line totals, return line totals, and the total/return amounts.

    ``discount`` is a percentage (0-100), matching the GRN terminal and
    ``_post_inventory``'s effective-price calculation."""
    items = []
    total = 0.0
    for item in payload_dict.get("items", []):
        subtotal   = item["unit_quantity"] * item["unit_price"]
        line_total = max(0.0, subtotal - subtotal * (item.get("discount", 0) / 100))
        total     += line_total
        items.append({**item, "line_total": round(line_total, 2)})

    return_items = []
    return_total = 0.0
    for ri in payload_dict.get("return_items", []):
        line_total    = ri["quantity"] * ri["unit_price"]
        return_total += line_total
        return_items.append({**ri, "line_total": round(line_total, 2)})

    total_amount  = round(total, 2)  if items        else float(payload_dict.get("manual_total_amount")  or 0)
    return_amount = round(return_total, 2) if return_items else float(payload_dict.get("manual_return_amount") or 0)
    return items, return_items, total_amount, return_amount


def _generate_invoice_number(db, branch_id: str, invoice_date: str) -> str:
    branch_code = get_branch_code(db, branch_id)
    return generate_document_number(db, branch_code, "PI", ref_date=invoice_date)


def _sync_supplier_balance(db, supplier_id: str) -> None:
    if not supplier_id:
        return
    pipeline = [
        # Drafts aren't owed yet and soft-deleted invoices must not count.
        {"$match": {"supplier_id": supplier_id, "is_active": {"$ne": False}, "status": {"$ne": "DRAFT"}}},
        {"$group": {"_id": None, "total": {"$sum": {"$subtract": ["$net_amount", "$paid_amount"]}}}},
    ]
    agg = list(db[Collections.PURCHASE_INVOICES].aggregate(pipeline))
    outstanding = round(agg[0]["total"], 2) if agg else 0
    db[Collections.SUPPLIERS].update_one(
        {"_id": supplier_id},
        {"$set": {"outstanding_balance": max(outstanding, 0), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )


def _payment_status(net_amount: float, paid: float) -> str:
    if paid <= 0:
        return "UNPAID"
    if paid >= net_amount:
        return "PAID"
    return "PARTIALLY_PAID"


def _recompute_return_status(items: list[dict]) -> str:
    """Record-level summary: PENDING if any line pending, else ACCEPTED if any
    accepted, else REJECTED."""
    statuses = [it.get("status", "PENDING") for it in items]
    if any(s == "PENDING" for s in statuses):
        return "PENDING"
    if any(s == "ACCEPTED" for s in statuses):
        return "ACCEPTED"
    return "REJECTED"


def _apply_returns(db, invoice_id: str, invoice_number: str, supplier_id: str, item_ids: list[str]) -> float:
    """Link existing supplier return line items to this invoice as credit. Returns total applied."""
    if not item_ids:
        return 0.0
    now     = datetime.now(timezone.utc).isoformat()
    applied = 0.0
    for item_id in item_ids:
        ret = db[Collections.PURCHASE_RETURNS].find_one({"items.item_id": item_id})
        if not ret:
            raise HTTPException(status_code=400, detail="Return item not found")
        if ret.get("supplier_id") != supplier_id:
            raise HTTPException(status_code=400, detail="Return does not belong to this supplier")
        items = ret.get("items", [])
        item  = next((it for it in items if it.get("item_id") == item_id), None)
        if not item:
            raise HTTPException(status_code=400, detail="Return item not found")
        if item.get("status") not in ("PENDING", "ACCEPTED"):
            raise HTTPException(status_code=400, detail="Return item is not eligible")
        if item.get("applied_invoice_id") and item["applied_invoice_id"] != invoice_id:
            raise HTTPException(status_code=400, detail="Return item is already applied to another invoice")
        amount   = item.get("line_total", 0)
        applied += amount
        item["status"]                 = "ACCEPTED"
        item["applied_invoice_id"]     = invoice_id
        item["applied_invoice_number"] = invoice_number
        item["applied_amount"]         = amount
        item["decided_at"]             = item.get("decided_at") or now
        db[Collections.PURCHASE_RETURNS].update_one(
            {"_id": ret["_id"]},
            {"$set": {"items": items, "status": _recompute_return_status(items), "updated_at": now}},
        )
    return round(applied, 2)


def _create_invoice_returns(db, invoice: dict, return_items: list[dict], current_user: dict) -> tuple[list[str], float]:
    """Create ONE grouped supplier return doc holding all of the invoice's return lines.

    Stock leaves immediately for every line. A line flagged ``deduct_now`` is ACCEPTED
    and applied to this invoice (reducing its net); the rest are PENDING supplier credit,
    each acceptable/rejectable on its own. Returns (applied_item_ids, applied_amount).
    """
    if not return_items:
        return [], 0.0

    now            = datetime.now(timezone.utc).isoformat()
    invoice_id     = invoice["_id"]
    invoice_number = invoice.get("invoice_number", "")
    branch_code    = get_branch_code(db, invoice["branch_id"])
    applied_ids: list[str] = []
    applied_amount = 0.0
    total          = 0.0
    items: list[dict] = []

    for ri in return_items:
        deduct     = bool(ri.get("deduct_now"))
        line_total = round(ri["quantity"] * ri["unit_price"], 2)
        total     += line_total
        item_id    = str(uuid.uuid4())
        items.append({
            "item_id":                item_id,
            "product_id":             ri["product_id"],
            "product_name":           ri.get("product_name", ""),
            "sku":                    ri.get("sku", ""),
            "batch_number":           ri.get("batch_number", ""),
            "expiry_date":            ri.get("expiry_date", ""),
            "quantity":               ri["quantity"],
            "unit_price":             ri["unit_price"],
            "line_total":             line_total,
            "status":                 "ACCEPTED" if deduct else "PENDING",
            "applied_invoice_id":     invoice_id if deduct else None,
            "applied_invoice_number": invoice_number if deduct else None,
            "applied_amount":         line_total if deduct else 0,
            "decided_by":             current_user["id"] if deduct else None,
            "decided_at":             now if deduct else None,
        })
        if deduct:
            applied_ids.append(item_id)
            applied_amount += line_total

    ret_id     = new_id()
    ret_number = generate_document_number(db, branch_code, "RET", ref_date=invoice.get("invoice_date"))
    ret_doc = {
        "_id":                   ret_id,
        "branch_id":             invoice["branch_id"],
        "supplier_id":           invoice["supplier_id"],
        "supplier_name":         invoice.get("supplier_name", ""),
        "channel_id":            invoice["channel_id"],
        "channel_name":          invoice.get("channel_name", ""),
        "return_date":           invoice.get("invoice_date"),
        "return_number":         ret_number,
        "items":                 items,
        "total_amount":          round(total, 2),
        "status":                _recompute_return_status(items),
        "source_invoice_id":     invoice_id,
        "source_invoice_number": invoice_number,
        "notes":                 None,
        "is_active":             True,
        "created_at":            now,
        "updated_at":            now,
        **audit_create_fields(current_user),
    }
    db[Collections.PURCHASE_RETURNS].insert_one(ret_doc)
    deduct_return_stock(db, current_user, ret_doc)

    return applied_ids, round(applied_amount, 2)


def _unapply_returns(db, item_ids: list[str]) -> None:
    """Release return line items back to available credit (clear invoice link, revert to PENDING)."""
    if not item_ids:
        return
    now = datetime.now(timezone.utc).isoformat()
    for item_id in item_ids:
        ret = db[Collections.PURCHASE_RETURNS].find_one({"items.item_id": item_id})
        if not ret:
            continue
        items = ret.get("items", [])
        for it in items:
            if it.get("item_id") == item_id:
                it["status"]                 = "PENDING"
                it["applied_invoice_id"]     = None
                it["applied_invoice_number"] = None
                it["applied_amount"]         = 0
                it["decided_by"]             = None
                it["decided_at"]             = None
                break
        db[Collections.PURCHASE_RETURNS].update_one(
            {"_id": ret["_id"]},
            {"$set": {"items": items, "status": _recompute_return_status(items), "updated_at": now}},
        )


def _update_invoice_confirmation_status(db, invoice_id: str, doc: dict, current_user: dict, *, items: list | None = None, return_items: list | None = None):
    effective_items   = items        if items        is not None else doc.get("items", [])
    effective_returns = return_items if return_items is not None else doc.get("return_items", [])

    items_confirmed   = sum(1 for it in effective_items if it.get("is_confirmed"))
    returns_confirmed = sum(1 for it in effective_returns if it.get("is_confirmed"))
    total_items       = len(effective_items)
    total_returns     = len(effective_returns)
    total_all         = total_items + total_returns
    confirmed_all     = items_confirmed + returns_confirmed

    if confirmed_all == 0:
        status = doc.get("status", "RECEIVED")
    elif confirmed_all < total_all:
        status = "PARTIALLY_VERIFIED"
    else:
        status = "VERIFIED"

    now = datetime.now(timezone.utc).isoformat()
    updates: dict = {
        "status": status,
        "updated_at": now,
        **audit_update_fields(current_user),
    }
    if items is not None:
        updates["items"] = items
    if return_items is not None:
        updates["return_items"] = return_items

    if status == "VERIFIED":
        updates["inventory_posted"] = True
        updates["verified_by"] = current_user["id"]
        updates["verified_at"] = now

    db[Collections.PURCHASE_INVOICES].update_one({"_id": invoice_id}, {"$set": updates})

    if status == "VERIFIED":
        if doc.get("purchase_order_id"):
            db[Collections.PURCHASE_ORDERS].update_one(
                {"_id": doc["purchase_order_id"]},
                {"$set": {"status": "RECEIVED", "updated_at": now}},
            )
        _sync_supplier_balance(db, doc.get("supplier_id", ""))

    return status


def _serialize(doc: dict) -> PurchaseInvoiceResponse:
    return PurchaseInvoiceResponse(**doc_to_dict(doc))


def _post_inventory(db, invoice: dict, current_user: dict) -> None:
    """Add every invoice item (unit + free qty) to branch inventory as batches.

    Items already stocked in through the per-item confirm flow
    (``is_confirmed``) are skipped so verifying a partially-confirmed
    invoice never double-posts."""
    branch_id = invoice["branch_id"]
    today     = datetime.now(timezone.utc).date().isoformat()
    for item in invoice.get("items", []):
        if item.get("is_confirmed"):
            continue
        qty = item["unit_quantity"] + item.get("free_quantity", 0)
        if qty <= 0:
            continue

        prod = db[Collections.PRODUCTS].find_one(
            {"_id": item["product_id"]},
            {"name": 1, "selling_price": 1, "basic_sku_id": 1, "basic_sku_name": 1, "sku_mappings": 1},
        )

        selling_price = item.get("selling_price") or 0
        if selling_price <= 0:
            selling_price = (prod or {}).get("selling_price") or item["unit_price"]

        # Calculate effective basic SKU prices considering free qty and discount
        sku_name        = item.get("sku", "")
        basic_sku_count = resolve_basic_sku_count(prod, sku_name)
        basic_sku_name  = (prod or {}).get("basic_sku_name", "")
        basic_sku_id    = (prod or {}).get("basic_sku_id", "")

        inv = find_or_create_inventory(
            db, current_user,
            product_id=item["product_id"], branch_id=branch_id,
            basic_sku_name=basic_sku_name, basic_sku_id=basic_sku_id,
            product_name=(prod or {}).get("name", item.get("product_name", "")),
        )

        unit_qty     = item["unit_quantity"]
        free_qty_val = item.get("free_quantity", 0)
        discount_pct = item.get("discount", 0)
        line_total   = unit_qty * item["unit_price"]
        if discount_pct > 0:
            line_total = line_total - line_total * (discount_pct / 100)
        total_qty_with_free = unit_qty + free_qty_val
        effective_purchase = (line_total / total_qty_with_free / basic_sku_count) if total_qty_with_free > 0 and basic_sku_count > 0 else item["unit_price"]
        effective_selling  = (selling_price / basic_sku_count) if basic_sku_count > 0 else selling_price

        # Inventory tracks stock in basic-SKU units under ``basic_sku_quantity``.
        basic_qty = qty * basic_sku_count

        batches  = list(inv.get("batches", []))
        existing = next((b for b in batches if b["batch_number"] == item["batch_number"]), None)
        if existing:
            set_batch_qty(existing, batch_qty(existing) + basic_qty)
        else:
            batches.append({
                "batch_number":             item["batch_number"],
                "expiry_date":              item["expiry_date"],
                "basic_sku_quantity":       basic_qty,
                "sku":                      sku_name,
                "purchase_price":           item["unit_price"],
                "selling_price":            selling_price,
                "basic_sku_purchase_price":  round(effective_purchase, 4),
                "basic_sku_selling_price":   round(effective_selling, 4),
                "supplier_id":              invoice.get("supplier_id", ""),
                "supplier_name":            invoice.get("supplier_name", ""),
                "received_date":            today,
            })
        db[Collections.INVENTORY].update_one(
            {"_id": inv["_id"]},
            {"$set": inventory_totals(inv, batches)},
        )


# ═══════════════════════════════════════════════════════════════════════════════
# PURCHASE INVOICES  /purchases/invoices
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/invoices", response_model=PaginatedResponse[PurchaseInvoiceResponse])
async def list_purchase_invoices(
    branch_id:      str | None = Query(default=None),
    status:         str | None = Query(default=None),
    payment_status: str | None = Query(default=None),
    supplier_id:    str | None = Query(default=None),
    channel_id:     str | None = Query(default=None),
    search:         str | None = Query(default=None),
    page:           int = Query(default=1, ge=1),
    page_size:      int = Query(default=20, ge=1, le=500),
    sort_by:        str | None = Query(default="created_at"),
    sort_dir:       str | None = Query(default="desc"),
    current_user:   dict = Depends(get_current_user),
):
    db  = get_db()
    flt = {"is_active": {"$ne": False}}

    bid = effective_branch_id(current_user, branch_id)
    if bid:               flt["branch_id"]      = bid
    if status:            flt["status"]          = status
    if payment_status:    flt["payment_status"]  = payment_status
    if supplier_id:       flt["supplier_id"]     = supplier_id
    if channel_id:        flt["channel_id"]      = channel_id
    if search:            flt.update(build_search_filter(search, ["supplier_name", "invoice_number", "distributor_invoice_no"]))

    sort_field     = sort_by if sort_by in PURCHASE_INVOICE_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.PURCHASE_INVOICES].count_documents(flt)
    skip  = (page - 1) * page_size

    if sort_field == "due_date":
        pipeline = [
            {"$match": flt},
            {"$addFields": {
                "_due_date_sort": {
                    "$cond": {
                        "if": {"$and": [{"$gt": ["$invoice_date", None]}, {"$gt": ["$credit_term_days", None]}]},
                        "then": {
                            "$dateAdd": {
                                "startDate": {"$dateFromString": {"dateString": {"$substr": ["$invoice_date", 0, 10]}}},
                                "unit": "day",
                                "amount": "$credit_term_days",
                            }
                        },
                        "else": None,
                    }
                }
            }},
            {"$sort": {"_due_date_sort": sort_direction}},
            {"$skip": skip},
            {"$limit": page_size},
        ]
        docs = db[Collections.PURCHASE_INVOICES].aggregate(pipeline)
    else:
        docs = (
            db[Collections.PURCHASE_INVOICES]
            .find(flt)
            .sort(sort_field, sort_direction)
            .skip(skip)
            .limit(page_size)
        )

    return PaginatedResponse[PurchaseInvoiceResponse](
        data=[_serialize(d) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


@router.get("/invoices/export")
async def export_purchase_invoices(
    branch_id:      str | None = Query(default=None),
    status:         str | None = Query(default=None),
    payment_status: str | None = Query(default=None),
    search:         str | None = Query(default=None),
    current_user:   dict = Depends(get_current_user),
):
    db  = get_db()
    flt = {"is_active": {"$ne": False}}

    bid = effective_branch_id(current_user, branch_id)
    if bid:               flt["branch_id"]      = bid
    if status:            flt["status"]          = status
    if payment_status:    flt["payment_status"]  = payment_status
    if search:            flt.update(build_search_filter(search, ["supplier_name", "invoice_number", "distributor_invoice_no"]))

    docs   = db[Collections.PURCHASE_INVOICES].find(flt).sort("created_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Invoice #", "Invoice Date", "Branch", "Supplier", "Channel", "Items", "Total", "Return", "Net", "Status", "Payment"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("invoice_number", ""),
            d.get("invoice_date", "")[:10],
            d.get("branch_id", ""),
            d.get("supplier_name", ""),
            d.get("channel_name", ""),
            len(d.get("items", [])),
            f"{d.get('total_amount', 0):,.2f}",
            f"{d.get('return_amount', 0):,.2f}",
            f"{d.get('net_amount', 0):,.2f}",
            d.get("status", ""),
            d.get("payment_status", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=purchase_invoices_export.csv"},
    )


@router.get("/invoices/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def get_purchase_invoice(
    invoice_id:   str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    ensure_branch_access(doc_to_dict(doc), current_user)
    return _serialize(doc)


@router.post("/invoices", response_model=PurchaseInvoiceResponse, status_code=201)
async def create_purchase_invoice(
    payload:      PurchaseInvoiceCreate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    branch_id = enforce_branch_on_create(payload.branch_id, current_user)

    supplier_name, channel_name, credit_term_days = _resolve_supplier(db, payload.supplier_id, payload.channel_id)

    payload_dict = payload.model_dump()
    items, _legacy_returns, total_amount, _ = _compute_amounts(payload_dict)

    invoice_number = _generate_invoice_number(db, branch_id, payload.invoice_date)
    doc_id         = new_id()

    invoice_ctx = {
        "_id": doc_id, "branch_id": branch_id, "supplier_id": payload.supplier_id,
        "supplier_name": supplier_name, "channel_id": payload.channel_id, "channel_name": channel_name,
        "invoice_number": invoice_number, "invoice_date": payload.invoice_date,
    }

    is_draft = payload.status == "DRAFT"

    if not is_draft:
        # Returns entered on this invoice → create supplier returns (stock leaves now).
        # deduct_now items reduce this invoice; the rest become pending supplier credit.
        created_ids, created_amount = _create_invoice_returns(db, invoice_ctx, payload_dict.get("return_items") or [], current_user)
        # Existing supplier return items picked to also deduct from this invoice.
        picked_ids    = payload_dict.get("applied_return_item_ids") or []
        picked_amount = _apply_returns(db, doc_id, invoice_number, payload.supplier_id, picked_ids)
        applied_return_item_ids = created_ids + picked_ids
        return_amount = round(created_amount + picked_amount, 2)
        saved_return_items = []
    else:
        # DRAFT: keep return items pending on the invoice — no stock deduction yet.
        applied_return_item_ids = []
        return_amount = 0.0
        saved_return_items = [
            {**ri, "line_total": round(ri.get("quantity", 0) * ri.get("unit_price", 0), 2)}
            for ri in (payload_dict.get("return_items") or [])
        ]

    net_amount    = round(total_amount - return_amount, 2)

    data = {
        "_id":                      doc_id,
        **payload_dict,
        "branch_id":                branch_id,
        "items":                    items,
        "return_items":             saved_return_items,
        "applied_return_item_ids":  applied_return_item_ids,
        "invoice_number":           invoice_number,
        "supplier_name":            supplier_name,
        "channel_name":             channel_name,
        "credit_term_days":         credit_term_days,
        "total_amount":             total_amount,
        "return_amount":            return_amount,
        "net_amount":               net_amount,
        "payment_status":           "UNPAID",
        "paid_amount":              0,
        "payment_entries":          [],
        "verified_by":              None,
        "verified_at":              None,
        "inventory_posted":         False,
        "created_at":               now,
        "updated_at":               now,
        **audit_create_fields(current_user),
    }

    # If created directly as VERIFIED, post to inventory immediately.
    if data["status"] == "VERIFIED":
        _post_inventory(db, data, current_user)
        data["inventory_posted"] = True
        data["verified_by"]      = current_user["id"]
        data["verified_at"]      = now

    db[Collections.PURCHASE_INVOICES].insert_one(data)
    _sync_supplier_balance(db, payload.supplier_id)

    if payload.purchase_order_id:
        db[Collections.PURCHASE_ORDERS].update_one(
            {"_id": payload.purchase_order_id},
            {"$set": {"status": "RECEIVED", "updated_at": now}},
        )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="purchase_invoice", resource_id=doc_id,
    )
    return _serialize(data)


@router.patch("/invoices/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def update_purchase_invoice(
    invoice_id:   str,
    payload:      PurchaseInvoiceUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    ensure_branch_access(doc_to_dict(doc), current_user)
    if doc["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT invoices can be edited")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}

    # VERIFIED is reached only through the verify flow (which posts inventory).
    if updates.get("status") == "VERIFIED":
        raise HTTPException(status_code=400, detail="Use the receive/verify flow to verify an invoice")

    if "supplier_id" in updates or "channel_id" in updates:
        supplier_id = updates.get("supplier_id", doc["supplier_id"])
        channel_id  = updates.get("channel_id",  doc["channel_id"])
        supplier_name, channel_name, credit_term_days = _resolve_supplier(db, supplier_id, channel_id)
        updates["supplier_name"]    = supplier_name
        updates["channel_name"]     = channel_name
        updates["credit_term_days"] = credit_term_days

    supplier_id   = updates.get("supplier_id", doc["supplier_id"])
    new_status    = updates.get("status", doc["status"])
    invoice_ctx   = {
        "_id": invoice_id, "branch_id": doc["branch_id"], "supplier_id": supplier_id,
        "supplier_name": updates.get("supplier_name", doc.get("supplier_name", "")),
        "channel_id":    updates.get("channel_id",    doc.get("channel_id", "")),
        "channel_name":  updates.get("channel_name",  doc.get("channel_name", "")),
        "invoice_number": doc.get("invoice_number", ""),
        "invoice_date":   updates.get("invoice_date", doc.get("invoice_date")),
    }

    if new_status == "RECEIVED":
        # Transitioning from DRAFT → RECEIVED: process all return items now.
        # Fall back to the return items saved on the draft when the payload
        # doesn't resend them, so pending returns aren't silently dropped.
        if "return_items" in updates:
            payload_return_items = updates.get("return_items") or []
        else:
            payload_return_items = doc.get("return_items") or []
        created_ids, _ = _create_invoice_returns(db, invoice_ctx, payload_return_items, current_user)
        picked_ids = updates.get("applied_return_item_ids") or []
        if picked_ids:
            _apply_returns(db, invoice_id, doc.get("invoice_number", ""), supplier_id, picked_ids)
        final_applied = created_ids + picked_ids
        updates["applied_return_item_ids"] = final_applied
        updates["return_items"]            = []
    else:
        # Still DRAFT: save return items as pending — no stock deduction.
        final_applied = []
        updates["applied_return_item_ids"] = []
        # Keep return_items as-is in updates (saved to doc as pending)

    # Recompute amounts.
    merged = {
        "items":               updates.get("items",               doc.get("items", [])),
        "return_items":        [],
        "manual_total_amount": updates.get("manual_total_amount", doc.get("manual_total_amount")),
    }
    items, _return_items, total_amount, _ = _compute_amounts(merged)
    return_amount = 0.0
    if final_applied:
        id_set = set(final_applied)
        for ret in db[Collections.PURCHASE_RETURNS].find({"items.item_id": {"$in": final_applied}}):
            for it in ret.get("items", []):
                if it.get("item_id") in id_set:
                    return_amount += it.get("line_total", 0)
        return_amount = round(return_amount, 2)
    updates["items"]         = items
    updates["total_amount"]  = total_amount
    updates["return_amount"] = return_amount
    updates["net_amount"]    = round(total_amount - return_amount, 2)
    updates["payment_status"] = _payment_status(updates["net_amount"], doc.get("paid_amount", 0))
    updates["updated_at"]    = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.PURCHASE_INVOICES].update_one({"_id": invoice_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="purchase_invoice", resource_id=invoice_id,
    )
    return _serialize(db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id}))


@router.post("/invoices/{invoice_id}/verify", response_model=PurchaseInvoiceResponse)
async def verify_purchase_invoice(
    invoice_id:   str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    ensure_branch_access(doc_to_dict(doc), current_user)
    if doc["status"] == "VERIFIED":
        raise HTTPException(status_code=400, detail="Invoice is already verified")

    now = datetime.now(timezone.utc).isoformat()
    if not doc.get("inventory_posted"):
        _post_inventory(db, doc, current_user)

    db[Collections.PURCHASE_INVOICES].update_one(
        {"_id": invoice_id},
        {"$set": {
            "status":           "VERIFIED",
            "inventory_posted": True,
            "verified_by":      current_user["id"],
            "verified_at":      now,
            "updated_at":       now,
            **audit_update_fields(current_user),
        }},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="VERIFY",
        resource="purchase_invoice", resource_id=invoice_id,
    )
    return _serialize(db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id}))


@router.post("/invoices/{invoice_id}/confirm-item", response_model=PurchaseInvoiceResponse)
async def confirm_invoice_item(
    invoice_id:   str,
    payload:      ConfirmInvoiceItemPayload,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    if doc["status"] == "VERIFIED":
        raise HTTPException(status_code=400, detail="Invoice is already verified")

    items = doc.get("items", [])
    idx   = payload.item_index
    if idx < 0 or idx >= len(items):
        raise HTTPException(status_code=400, detail="Invalid item index")

    item = items[idx]
    if item.get("is_confirmed"):
        raise HTTPException(status_code=400, detail="Item already confirmed")

    item["is_confirmed"]      = True
    item["confirmed_quantity"] = payload.confirmed_quantity
    if payload.stock_location_id:
        item["stock_location_id"] = payload.stock_location_id

    branch_id  = doc["branch_id"]
    product_id = item["product_id"]

    product_doc    = db[Collections.PRODUCTS].find_one({"_id": product_id})
    basic_sku_id   = product_doc.get("basic_sku_id", "")   if product_doc else ""
    basic_sku_name = product_doc.get("basic_sku_name", "") if product_doc else ""
    if not basic_sku_name and basic_sku_id:
        sku_doc = db[Collections.SKUS].find_one({"_id": basic_sku_id}, {"name": 1})
        basic_sku_name = sku_doc.get("name", "") if sku_doc else ""
    sku_name       = item.get("sku", "") or basic_sku_name
    sku_mappings   = product_doc.get("sku_mappings", []) if product_doc else []
    basic_sku_count = 1
    for m in sku_mappings:
        if m.get("sku") == sku_name:
            basic_sku_count = m.get("basic_sku_count", 1)
            break

    total_received = payload.confirmed_quantity
    basic_qty      = total_received * basic_sku_count
    sell_price     = item.get("selling_price", 0)
    buy_price      = item.get("unit_price", 0)
    basic_sell     = round(sell_price / basic_sku_count, 2) if basic_sku_count > 0 else sell_price
    basic_buy      = round(buy_price / basic_sku_count, 2)  if basic_sku_count > 0 else buy_price

    inv = find_or_create_inventory(
        db, current_user,
        product_id=product_id, branch_id=branch_id,
        basic_sku_name=basic_sku_name, basic_sku_id=basic_sku_id,
        product_name=(product_doc or {}).get("name", item.get("product_name", "")),
    )

    batches  = list(inv.get("batches", []))
    existing = next((b for b in batches if b["batch_number"] == item["batch_number"]), None)
    if existing:
        set_batch_qty(existing, batch_qty(existing) + basic_qty)
    else:
        batches.append({
            "batch_number":            item["batch_number"],
            "expiry_date":             item["expiry_date"],
            "basic_sku_quantity":       basic_qty,
            "basic_sku_selling_price":  basic_sell,
            "basic_sku_purchase_price": basic_buy,
        })

    db[Collections.INVENTORY].update_one(
        {"_id": inv["_id"]},
        {"$set": {**inventory_totals(inv, batches), **audit_update_fields(current_user)}},
    )

    invoice_number = doc.get("invoice_number", "")
    log_inventory(
        db, current_user, branch_id=branch_id, product_id=product_id,
        batch_number=item["batch_number"], quantity=payload.confirmed_quantity,
        movement_type="STOCK_IN",
        expiry_date=item.get("expiry_date"),
        sku=sku_name, selling_price=sell_price, purchase_price=buy_price,
        basic_sku=basic_sku_name, basic_sku_id=basic_sku_id, basic_sku_count=basic_sku_count,
        basic_sku_quantity=basic_qty, basic_sku_selling_price=basic_sell, basic_sku_purchase_price=basic_buy,
        stock_location_id=payload.stock_location_id,
        reference_id=invoice_id, reference_type="purchase_invoice", reference_value=invoice_number,
    )

    _update_invoice_confirmation_status(db, invoice_id, doc, current_user, items=items)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CONFIRM_ITEM",
        resource="purchase_invoice", resource_id=invoice_id,
    )
    return _serialize(db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id}))


@router.post("/invoices/{invoice_id}/confirm-return-item", response_model=PurchaseInvoiceResponse)
async def confirm_return_item(
    invoice_id:   str,
    payload:      ConfirmReturnItemPayload,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    if doc["status"] == "VERIFIED":
        raise HTTPException(status_code=400, detail="Invoice is already verified")

    return_items = doc.get("return_items", [])
    idx = payload.item_index
    if idx < 0 or idx >= len(return_items):
        raise HTTPException(status_code=400, detail="Invalid return item index")

    item = return_items[idx]
    if item.get("is_confirmed"):
        raise HTTPException(status_code=400, detail="Return item already confirmed")

    item["is_confirmed"]      = True
    item["confirmed_quantity"] = payload.confirmed_quantity
    if payload.stock_location_id:
        item["stock_location_id"] = payload.stock_location_id

    branch_id  = doc["branch_id"]
    product_id = item["product_id"]

    product_doc    = db[Collections.PRODUCTS].find_one({"_id": product_id})
    basic_sku_id   = product_doc.get("basic_sku_id", "")   if product_doc else ""
    basic_sku_name = product_doc.get("basic_sku_name", "") if product_doc else ""
    if not basic_sku_name and basic_sku_id:
        sku_doc = db[Collections.SKUS].find_one({"_id": basic_sku_id}, {"name": 1})
        basic_sku_name = sku_doc.get("name", "") if sku_doc else ""
    sku_name        = item.get("sku", "") or basic_sku_name
    basic_sku_count = resolve_basic_sku_count(product_doc, sku_name)

    basic_qty  = payload.confirmed_quantity * basic_sku_count
    buy_price  = item.get("unit_price", 0)
    basic_buy  = round(buy_price / basic_sku_count, 2) if basic_sku_count > 0 else buy_price

    inv, batch = find_inventory_with_batch(db, product_id, branch_id, item["batch_number"])
    if not inv:
        raise HTTPException(status_code=400, detail=f"No inventory found for product '{item.get('product_name', product_id)}'")
    if not batch:
        raise HTTPException(status_code=400, detail=f"Batch '{item['batch_number']}' not found in inventory")
    available = batch_qty(batch)
    if available < basic_qty:
        raise HTTPException(status_code=400, detail=f"Insufficient qty (available: {available})")

    set_batch_qty(batch, available - basic_qty)
    batches = [b for b in inv.get("batches", []) if batch_qty(b) > 0]

    db[Collections.INVENTORY].update_one(
        {"_id": inv["_id"]},
        {"$set": {**inventory_totals(inv, batches), **audit_update_fields(current_user)}},
    )

    invoice_number = doc.get("invoice_number", "")
    log_inventory(
        db, current_user, branch_id=branch_id, product_id=product_id,
        batch_number=item.get("batch_number", ""), quantity=payload.confirmed_quantity,
        movement_type="PURCHASE_RETURN",
        expiry_date=None,
        sku=basic_sku_name, selling_price=0, purchase_price=buy_price,
        basic_sku=basic_sku_name, basic_sku_id=basic_sku_id, basic_sku_count=basic_sku_count,
        basic_sku_quantity=basic_qty, basic_sku_selling_price=0, basic_sku_purchase_price=basic_buy,
        stock_location_id=payload.stock_location_id,
        reference_id=invoice_id, reference_type="purchase_return", reference_value=invoice_number,
    )

    _update_invoice_confirmation_status(db, invoice_id, doc, current_user, return_items=return_items)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CONFIRM_RETURN_ITEM",
        resource="purchase_invoice", resource_id=invoice_id,
    )
    return _serialize(db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id}))


@router.delete("/invoices/{invoice_id}", status_code=204)
async def delete_purchase_invoice(
    invoice_id:   str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    ensure_branch_access(doc_to_dict(doc), current_user)
    if doc["status"] == "VERIFIED":
        raise HTTPException(status_code=400, detail="Verified invoices cannot be deleted")
    if doc.get("paid_amount", 0) > 0:
        raise HTTPException(status_code=400, detail="Invoices with payments cannot be deleted")
    if any(it.get("is_confirmed") for it in doc.get("items", []) + doc.get("return_items", [])):
        raise HTTPException(status_code=400, detail="Invoices with confirmed (stocked-in) items cannot be deleted")

    # Release any return credit linked to this invoice.
    _unapply_returns(db, doc.get("applied_return_item_ids", []) or [])

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PURCHASE_INVOICES].update_one(
        {"_id": invoice_id},
        {"$set": {"is_active": False, "applied_return_item_ids": [], "updated_at": now, **audit_update_fields(current_user)}},
    )
    _sync_supplier_balance(db, doc.get("supplier_id", ""))
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="SOFT_DELETE",
        resource="purchase_invoice", resource_id=invoice_id,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PURCHASE PAYMENTS  /purchases/payments  (settle one or more invoices together)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/payments", response_model=PurchasePaymentResponse, status_code=201)
async def create_purchase_payment(
    payload:      PurchasePaymentCreate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # ── Validate EVERYTHING up front (no partial writes on failure) ──────────
    invoices: dict[str, dict] = {}
    for alloc in payload.allocations:
        doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": alloc.invoice_id})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Invoice {alloc.invoice_id} not found")
        if doc.get("is_active") is False:
            raise HTTPException(status_code=400, detail=f"Invoice {doc.get('invoice_number', alloc.invoice_id)} has been deleted")
        if doc.get("status") == "DRAFT":
            raise HTTPException(status_code=400, detail=f"Invoice {doc.get('invoice_number', alloc.invoice_id)} is still a draft and cannot be paid")
        ensure_branch_access(doc_to_dict(doc), current_user)
        outstanding = round(doc.get("net_amount", 0) - doc.get("paid_amount", 0), 2)
        if alloc.amount > outstanding + 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Allocation {alloc.amount:.2f} exceeds outstanding {outstanding:.2f} for {doc.get('invoice_number', alloc.invoice_id)}",
            )
        invoices[alloc.invoice_id] = doc

    supplier_ids = {doc.get("supplier_id") for doc in invoices.values() if doc.get("supplier_id")}

    # Validate credit notes BEFORE any invoice is mutated.
    credit_notes: list[dict] = []
    for cn_id in (payload.credit_note_ids or []):
        cn_doc = db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})
        if not cn_doc:
            raise HTTPException(status_code=404, detail=f"Credit note {cn_id} not found")
        if cn_doc.get("status") != "APPROVED":
            raise HTTPException(status_code=400, detail=f"Credit note {cn_doc.get('credit_note_number', cn_id)} is not in APPROVED status")
        ensure_branch_access(doc_to_dict(cn_doc), current_user)
        if invoices and cn_doc.get("supplier_id") and cn_doc["supplier_id"] not in supplier_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Credit note {cn_doc.get('credit_note_number', cn_id)} belongs to a different supplier than the invoices being settled",
            )
        credit_notes.append(cn_doc)

    payment_id   = new_id()
    total_amount = round(sum(a.amount for a in payload.allocations), 2)

    # Validate + prepare the funding source so the money actually leaves it.
    registry = None
    bank_account = None
    if total_amount > 0:
        if payload.payment_method == "CASH":
            if not payload.cash_register_id:
                raise HTTPException(status_code=400, detail="cash_register_id is required for CASH payments")
            registry_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": payload.cash_register_id})
            if not registry_doc:
                raise HTTPException(status_code=400, detail="Cash register not found")
            registry = doc_to_dict(registry_doc)
            ensure_branch_access(registry, current_user)
            if not registry.get("is_open"):
                raise HTTPException(status_code=400, detail="Cash register is closed. Please open it before making a payment.")
            if total_amount > registry.get("current_balance", 0):
                raise HTTPException(status_code=400, detail=f"Insufficient cash in register. Available: {registry.get('current_balance', 0):.2f}")
        elif payload.payment_method == "BANK_TRANSFER":
            if not payload.bank_account_id:
                raise HTTPException(status_code=400, detail="bank_account_id is required for BANK_TRANSFER payments")
            account_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": payload.bank_account_id})
            if not account_doc:
                raise HTTPException(status_code=400, detail="Bank account not found")
            bank_account = doc_to_dict(account_doc)
            ensure_branch_access(bank_account, current_user)
            if not bank_account.get("is_active"):
                raise HTTPException(status_code=400, detail="Bank account is inactive")
            if total_amount > bank_account.get("current_balance", 0):
                raise HTTPException(status_code=400, detail=f"Insufficient bank balance. Available: {bank_account.get('current_balance', 0):.2f}")

    # ── Apply allocations ─────────────────────────────────────────────────────
    for alloc in payload.allocations:
        doc      = invoices[alloc.invoice_id]
        entries  = doc.get("payment_entries", [])
        entries.append({
            "payment_id":     payment_id,
            "amount":         alloc.amount,
            "payment_date":   payload.payment_date,
            "payment_method": payload.payment_method,
            "reference":      payload.reference,
        })
        paid = round(doc.get("paid_amount", 0) + alloc.amount, 2)
        db[Collections.PURCHASE_INVOICES].update_one(
            {"_id": alloc.invoice_id},
            {"$set": {
                "payment_entries": entries,
                "paid_amount":     paid,
                "payment_status":  _payment_status(doc.get("net_amount", 0), paid),
                "updated_at":      now,
            }},
        )

    # ── Post the money movement against the funding source ───────────────────
    if registry is not None:
        balance_before = registry.get("current_balance", 0)
        balance_after  = round(balance_before - total_amount, 2)
        db[Collections.CASH_REGISTRIES].update_one(
            {"_id": payload.cash_register_id},
            {"$set": {"current_balance": balance_after, "updated_at": now, **audit_update_fields(current_user)}},
        )
        _create_cash_transaction(
            db, registry_doc=registry, transaction_type="WITHDRAWAL",
            amount=total_amount, balance_before=balance_before, balance_after=balance_after,
            notes=f"Supplier payment ({payload.reference or payment_id})",
            reference_id=payment_id, current_user=current_user,
        )
    elif bank_account is not None:
        balance_before = bank_account.get("current_balance", 0)
        balance_after  = round(balance_before - total_amount, 2)
        db[Collections.BANK_ACCOUNTS].update_one(
            {"_id": payload.bank_account_id},
            {"$set": {"current_balance": balance_after, "updated_at": now, **audit_update_fields(current_user)}},
        )
        _create_bank_transaction(
            db, account_doc=bank_account, transaction_type="WITHDRAWAL",
            amount=total_amount, balance_before=balance_before, balance_after=balance_after,
            notes=f"Supplier payment ({payload.reference or payment_id})",
            reference_id=payment_id, current_user=current_user,
        )
    # CHEQUE payments deduct the bank balance when the cheque is cleared
    # (see cheques.py status flow) — nothing to post here.

    # ── Apply credit notes ────────────────────────────────────────────────────
    credit_note_allocations = []
    for cn_doc in credit_notes:
        cn_id     = cn_doc["_id"]
        cn_branch = cn_doc.get("branch_id", "")
        for item in cn_doc.get("items", []):
            inv_doc, batch = find_inventory_with_batch(db, item.get("product_id"), cn_branch, item.get("batch_number"))
            if inv_doc and batch:
                set_batch_qty(batch, max(0, batch_qty(batch) - item.get("quantity", 0)))
                batches = [b for b in inv_doc.get("batches", []) if batch_qty(b) > 0]
                db[Collections.INVENTORY].update_one(
                    {"_id": inv_doc["_id"]},
                    {"$set": inventory_totals(inv_doc, batches)},
                )

        cn_amount = cn_doc.get("total_amount", 0)
        credit_note_allocations.append({"credit_note_id": cn_id, "amount": cn_amount})

        db[Collections.PURCHASE_CREDIT_NOTES].update_one(
            {"_id": cn_id},
            {"$set": {
                "status": "APPLIED",
                "applied_payment_id": payment_id,
                "applied_at": now,
                "inventory_deducted": True,
                "updated_at": now,
                **audit_update_fields(current_user),
            }},
        )

        cn_supplier = cn_doc.get("supplier_id")
        if cn_supplier:
            supplier_ids.add(cn_supplier)

    for sid in supplier_ids:
        _sync_supplier_balance(db, sid)

    payment_doc = {
        "_id":                      payment_id,
        "payment_date":             payload.payment_date,
        "payment_method":           payload.payment_method,
        "cash_register_id":         payload.cash_register_id,
        "bank_account_id":          payload.bank_account_id,
        "cheque_book_id":           payload.cheque_book_id,
        "cheque_number":            payload.cheque_number,
        "cheque_due_date":          payload.cheque_due_date,
        "cheque_status":            payload.cheque_status,
        "reference":                payload.reference,
        "total_amount":             total_amount,
        "allocations":              [a.model_dump() for a in payload.allocations],
        "credit_note_allocations":  credit_note_allocations,
        "created_by":               current_user["id"],
        "created_at":               now,
        "updated_at":               now,
        **audit_create_fields(current_user),
    }
    db[Collections.PURCHASE_PAYMENTS].insert_one(payment_doc)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="purchase_payment", resource_id=payment_id,
    )
    return PurchasePaymentResponse(**doc_to_dict(payment_doc))


@router.get("/payments", response_model=PaginatedResponse[PurchasePaymentResponse])
async def list_purchase_payments(
    page:         int = Query(default=1, ge=1),
    page_size:    int = Query(default=20, ge=1, le=200),
    sort_by:      str | None = Query(default="created_at"),
    sort_dir:     str | None = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    sort_direction = -1 if sort_dir == "desc" else 1
    sort_field     = sort_by if sort_by in {"created_at", "payment_date", "total_amount"} else "created_at"

    total = db[Collections.PURCHASE_PAYMENTS].count_documents({})
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.PURCHASE_PAYMENTS]
        .find({})
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )
    return PaginatedResponse[PurchasePaymentResponse](
        data=[PurchasePaymentResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )
