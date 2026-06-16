from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.purchase_invoice import (
    PurchaseInvoiceCreate, PurchaseInvoiceUpdate, PurchaseInvoiceResponse,
    PurchasePaymentCreate, PurchasePaymentResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/purchases", tags=["Purchase Invoices"])

BRANCH_ROLES                = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}
PURCHASE_INVOICE_SORT_FIELDS = {
    "created_at", "updated_at", "invoice_date", "invoice_number",
    "supplier_name", "status", "payment_status", "total_amount", "net_amount",
}


def _branch_scope(current_user: dict, requested_branch_id: str | None) -> str | None:
    if current_user["role"] in BRANCH_ROLES:
        return current_user["branch_id"]
    return requested_branch_id


def _resolve_supplier(db, supplier_id: str, channel_id: str) -> tuple[str, str, int]:
    """Return (supplier_name, channel_name, credit_term_days)."""
    supplier_doc = db[Collections.SUPPLIERS].find_one({"_id": supplier_id})
    if not supplier_doc:
        return "", "", 30
    supplier_name    = supplier_doc.get("short_name", "")
    channel_name     = ""
    credit_term_days = 30
    channels = supplier_doc.get("distributor_channels", []) + supplier_doc.get("agency_channels", [])
    for ch in channels:
        if str(ch.get("id", "")) == channel_id:
            channel_name     = ch.get("channel_name", "")
            credit_term_days = ch.get("credit_term_days", 30)
            break
    return supplier_name, channel_name, credit_term_days


def _compute_amounts(payload_dict: dict) -> tuple[list, list, float, float]:
    """Compute item line totals, return line totals, and the total/return amounts."""
    items = []
    total = 0.0
    for item in payload_dict.get("items", []):
        line_total = item["unit_quantity"] * item["unit_price"] - item.get("discount", 0)
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


def _generate_invoice_number(db, invoice_date: str) -> str:
    """MG/PI/yyyy/MM/dd/XX — XX is max+1 for that invoice date."""
    date_part = invoice_date[:10]                     # yyyy-MM-dd
    yyyy, mm, dd = date_part.split("-")
    prefix = f"MG/PI/{yyyy}/{mm}/{dd}/"
    existing = db[Collections.PURCHASE_INVOICES].find(
        {"invoice_number": {"$regex": f"^{prefix.replace('/', chr(92) + '/')}"}},
        {"invoice_number": 1},
    )
    max_seq = 0
    for d in existing:
        tail = d.get("invoice_number", "").rsplit("/", 1)[-1]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1:02d}"


def _payment_status(net_amount: float, paid: float) -> str:
    if paid <= 0:
        return "UNPAID"
    if paid >= net_amount:
        return "PAID"
    return "PARTIALLY_PAID"


def _serialize(doc: dict) -> PurchaseInvoiceResponse:
    return PurchaseInvoiceResponse(**doc_to_dict(doc))


def _post_inventory(db, invoice: dict, current_user: dict) -> None:
    """Add every invoice item (unit + free qty) to branch inventory as batches."""
    branch_id = invoice["branch_id"]
    today     = datetime.now(timezone.utc).date().isoformat()
    for item in invoice.get("items", []):
        qty = item["unit_quantity"] + item.get("free_quantity", 0)
        if qty <= 0:
            continue
        inv = db[Collections.INVENTORY].find_one(
            {"product_id": item["product_id"], "branch_id": branch_id}
        )
        if not inv:
            now     = datetime.now(timezone.utc).isoformat()
            product = db[Collections.PRODUCTS].find_one({"_id": item["product_id"]}, {"name": 1, "selling_price": 1})
            inv = {
                "_id":             new_id(),
                "branch_id":       branch_id,
                "product_id":      item["product_id"],
                "product_name":    product["name"] if product else item.get("product_name", ""),
                "batches":         [],
                "total_quantity":  0,
                "min_stock_level": 0,
                "is_low_stock":    False,
                "created_at":      now,
                "updated_at":      now,
            }
            db[Collections.INVENTORY].insert_one(inv)

        selling_price = item.get("selling_price") or 0
        if selling_price <= 0:
            product       = db[Collections.PRODUCTS].find_one({"_id": item["product_id"]}, {"selling_price": 1})
            selling_price = (product or {}).get("selling_price") or item["unit_price"]
        batches  = list(inv.get("batches", []))
        existing = next((b for b in batches if b["batch_number"] == item["batch_number"]), None)
        if existing:
            existing["quantity"] += qty
        else:
            batches.append({
                "batch_number":   item["batch_number"],
                "expiry_date":    item["expiry_date"],
                "quantity":       qty,
                "sku":            item.get("sku", ""),
                "purchase_price": item["unit_price"],
                "selling_price":  selling_price,
                "supplier_id":    invoice.get("supplier_id", ""),
                "supplier_name":  invoice.get("supplier_name", ""),
                "received_date":  today,
            })
        total_qty = sum(b["quantity"] for b in batches)
        db[Collections.INVENTORY].update_one(
            {"_id": inv["_id"]},
            {"$set": {
                "batches":        batches,
                "total_quantity": total_qty,
                "is_low_stock":   total_qty <= inv.get("min_stock_level", 0),
                "updated_at":     datetime.now(timezone.utc).isoformat(),
            }},
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
    search:         str | None = Query(default=None),
    page:           int = Query(default=1, ge=1),
    page_size:      int = Query(default=20, ge=1, le=500),
    sort_by:        str | None = Query(default="created_at"),
    sort_dir:       str | None = Query(default="desc"),
    current_user:   dict = Depends(get_current_user),
):
    db  = get_db()
    flt = {}

    effective_branch = _branch_scope(current_user, branch_id)
    if effective_branch:  flt["branch_id"]      = effective_branch
    if status:            flt["status"]          = status
    if payment_status:    flt["payment_status"]  = payment_status
    if supplier_id:       flt["supplier_id"]     = supplier_id
    if search:            flt.update(build_search_filter(search, ["supplier_name", "invoice_number", "distributor_invoice_no"]))

    sort_field     = sort_by if sort_by in PURCHASE_INVOICE_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.PURCHASE_INVOICES].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = (
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
    flt = {}

    effective_branch = _branch_scope(current_user, branch_id)
    if effective_branch:  flt["branch_id"]      = effective_branch
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
    return _serialize(doc)


@router.post("/invoices", response_model=PurchaseInvoiceResponse, status_code=201)
async def create_purchase_invoice(
    payload:      PurchaseInvoiceCreate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    branch_id = _branch_scope(current_user, payload.branch_id) or payload.branch_id
    if not branch_id:
        raise HTTPException(status_code=400, detail="branch_id is required")

    supplier_name, channel_name, credit_term_days = _resolve_supplier(db, payload.supplier_id, payload.channel_id)

    payload_dict = payload.model_dump()
    items, return_items, total_amount, return_amount = _compute_amounts(payload_dict)
    net_amount = round(total_amount - return_amount, 2)

    invoice_number = _generate_invoice_number(db, payload.invoice_date)
    doc_id         = new_id()
    data = {
        "_id":                      doc_id,
        **payload_dict,
        "branch_id":                branch_id,
        "items":                    items,
        "return_items":             return_items,
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
    if doc["status"] == "VERIFIED":
        raise HTTPException(status_code=400, detail="Verified invoices cannot be edited")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}

    if "supplier_id" in updates or "channel_id" in updates:
        supplier_id = updates.get("supplier_id", doc["supplier_id"])
        channel_id  = updates.get("channel_id",  doc["channel_id"])
        supplier_name, channel_name, credit_term_days = _resolve_supplier(db, supplier_id, channel_id)
        updates["supplier_name"]    = supplier_name
        updates["channel_name"]     = channel_name
        updates["credit_term_days"] = credit_term_days

    # Recompute amounts from the merged item / return-item state.
    merged = {
        "items":                updates.get("items",                doc.get("items", [])),
        "return_items":         updates.get("return_items",         doc.get("return_items", [])),
        "manual_total_amount":  updates.get("manual_total_amount",  doc.get("manual_total_amount")),
        "manual_return_amount": updates.get("manual_return_amount", doc.get("manual_return_amount")),
    }
    items, return_items, total_amount, return_amount = _compute_amounts(merged)
    updates["items"]         = items
    updates["return_items"]  = return_items
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


@router.delete("/invoices/{invoice_id}", status_code=204)
async def delete_purchase_invoice(
    invoice_id:   str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    if doc["status"] == "VERIFIED":
        raise HTTPException(status_code=400, detail="Verified invoices cannot be deleted")
    if doc.get("paid_amount", 0) > 0:
        raise HTTPException(status_code=400, detail="Invoices with payments cannot be deleted")

    db[Collections.PURCHASE_INVOICES].delete_one({"_id": invoice_id})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="DELETE",
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

    # Validate every allocation up front.
    invoices: dict[str, dict] = {}
    for alloc in payload.allocations:
        doc = db[Collections.PURCHASE_INVOICES].find_one({"_id": alloc.invoice_id})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Invoice {alloc.invoice_id} not found")
        outstanding = round(doc.get("net_amount", 0) - doc.get("paid_amount", 0), 2)
        if alloc.amount > outstanding + 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Allocation {alloc.amount:.2f} exceeds outstanding {outstanding:.2f} for {doc.get('invoice_number', alloc.invoice_id)}",
            )
        invoices[alloc.invoice_id] = doc

    payment_id   = new_id()
    total_amount = round(sum(a.amount for a in payload.allocations), 2)

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

    payment_doc = {
        "_id":            payment_id,
        "payment_date":   payload.payment_date,
        "payment_method": payload.payment_method,
        "reference":      payload.reference,
        "total_amount":   total_amount,
        "allocations":    [a.model_dump() for a in payload.allocations],
        "created_by":     current_user["id"],
        "created_at":     now,
        "updated_at":     now,
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
