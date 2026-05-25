from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.purchase_order import (
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse,
    PurchaseInvoiceCreate, PurchaseInvoiceResponse, PaymentEntry,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/purchases", tags=["Purchases"])

BRANCH_ROLES               = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}
PURCHASE_ORDER_SORT_FIELDS = {"created_at", "updated_at", "total_amount", "status", "supplier_name"}
INVOICE_SORT_FIELDS        = {"received_at", "created_at", "status", "supplier_name", "invoice_date", "payment_status"}


def _branch_scope(current_user: dict, requested_branch_id: str | None) -> str | None:
    if current_user["role"] in BRANCH_ROLES:
        return current_user["branch_id"]
    return requested_branch_id


def _generate_invoice_number(db) -> str:
    count = db[Collections.GRNS].count_documents({})
    return f"PI-{count + 1:06d}"


# ═══════════════════════════════════════════════════════════════════════════════
# PURCHASE ORDERS  /purchases/orders
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/orders", response_model=PaginatedResponse[PurchaseOrderResponse])
async def list_purchase_orders(
    branch_id:  str | None = Query(default=None),
    status:     str | None = Query(default=None),
    search:     str | None = Query(default=None),
    page:       int = Query(default=1, ge=1),
    page_size:  int = Query(default=20, ge=1, le=100),
    sort_by:    str | None = Query(default="created_at"),
    sort_dir:   str | None = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    effective_branch = _branch_scope(current_user, branch_id)
    if effective_branch: filter["branch_id"] = effective_branch
    if status:           filter["status"]    = status
    if search:           filter.update(build_search_filter(search, ["supplier_name", "channel_name"]))

    sort_field     = sort_by if sort_by in PURCHASE_ORDER_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.PURCHASE_ORDERS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.PURCHASE_ORDERS]
        .find(filter)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[PurchaseOrderResponse](
        data=[PurchaseOrderResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


@router.get("/orders/export")
async def export_purchase_orders(
    branch_id:    str | None = Query(default=None),
    status:       str | None = Query(default=None),
    search:       str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    effective_branch = _branch_scope(current_user, branch_id)
    if effective_branch: filter["branch_id"] = effective_branch
    if status:           filter["status"]    = status
    if search:           filter.update(build_search_filter(search, ["supplier_name", "channel_name"]))

    docs   = db[Collections.PURCHASE_ORDERS].find(filter).sort("created_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["PO ID", "Branch", "Supplier", "Channel", "Items", "Total Amount", "Status", "Created At"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d["id"],
            d.get("branch_id", ""),
            d.get("supplier_name", ""),
            d.get("channel_name", ""),
            len(d.get("items", [])),
            f"{d.get('total_amount', 0):.2f}",
            d.get("status", ""),
            d.get("created_at", "")[:10],
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=purchase_orders_export.csv"},
    )


@router.post("/orders", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(
    payload:      PurchaseOrderCreate,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    supplier_doc  = db[Collections.SUPPLIERS].find_one({"_id": payload.supplier_id, "supplier_type": "DISTRIBUTOR"})
    supplier_name = supplier_doc.get("short_name", "") if supplier_doc else ""
    channel_name  = ""
    credit_term_days = 30
    if supplier_doc:
        for ch in supplier_doc.get("distributor_channels", []):
            if str(ch.get("id", "")) == payload.channel_id or ch.get("_id") == payload.channel_id:
                channel_name     = ch.get("channel_name", "")
                credit_term_days = ch.get("credit_term_days", 30)
                break

    items_data = []
    total      = 0.0
    for item in payload.items:
        item_total = item.quantity * item.unit_price
        total     += item_total
        items_data.append({**item.model_dump(), "total_price": item_total})

    doc_id = new_id()
    data = {
        "_id":           doc_id,
        **payload.model_dump(exclude={"items"}),
        "supplier_name":    supplier_name,
        "channel_name":     channel_name,
        "credit_term_days": credit_term_days,
        "items":            items_data,
        "total_amount":  total,
        "status":        "DRAFT",
        "created_by":    current_user["id"],
        "created_at":    now,
        "updated_at":    now,
        **audit_create_fields(current_user),
    }
    db[Collections.PURCHASE_ORDERS].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="purchase_order", resource_id=doc_id,
    )
    return PurchaseOrderResponse(**doc_to_dict(data))


@router.post("/orders/{po_id}/submit", response_model=PurchaseOrderResponse)
async def submit_for_approval(
    po_id:        str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if doc["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT orders can be submitted")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PURCHASE_ORDERS].update_one(
        {"_id": po_id},
        {"$set": {"status": "PENDING_APPROVAL", "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="SUBMIT",
        resource="purchase_order", resource_id=po_id,
    )
    return PurchaseOrderResponse(**doc_to_dict(db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})))


@router.post("/orders/{po_id}/approve", response_model=PurchaseOrderResponse)
async def approve_purchase_order(
    po_id:        str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if doc["status"] != "PENDING_APPROVAL":
        raise HTTPException(status_code=400, detail="Only PENDING_APPROVAL orders can be approved")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PURCHASE_ORDERS].update_one(
        {"_id": po_id},
        {"$set": {
            "status":      "APPROVED",
            "approved_by": current_user["id"],
            "approved_at": now,
            "updated_at":  now,
        }},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="APPROVE",
        resource="purchase_order", resource_id=po_id,
    )
    return PurchaseOrderResponse(**doc_to_dict(db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})))


@router.post("/orders/{po_id}/cancel", response_model=PurchaseOrderResponse)
async def cancel_purchase_order(
    po_id:        str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if doc["status"] not in ("DRAFT", "PENDING_APPROVAL"):
        raise HTTPException(status_code=400, detail="Only DRAFT or PENDING_APPROVAL orders can be cancelled")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PURCHASE_ORDERS].update_one(
        {"_id": po_id},
        {"$set": {"status": "CANCELLED", "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CANCEL",
        resource="purchase_order", resource_id=po_id,
    )
    return PurchaseOrderResponse(**doc_to_dict(db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})))


@router.get("/orders/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    po_id:        str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return PurchaseOrderResponse(**doc_to_dict(doc))


@router.patch("/orders/{po_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    po_id:        str,
    payload:      PurchaseOrderUpdate,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if doc["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT orders can be edited")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}

    if "items" in updates:
        total      = 0.0
        items_data = []
        for item in updates["items"]:
            item_dict  = item if isinstance(item, dict) else item.model_dump()
            item_total = item_dict["quantity"] * item_dict["unit_price"]
            total     += item_total
            items_data.append({**item_dict, "total_price": item_total})
        updates["items"]        = items_data
        updates["total_amount"] = total

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.PURCHASE_ORDERS].update_one({"_id": po_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="purchase_order", resource_id=po_id,
    )
    return PurchaseOrderResponse(**doc_to_dict(db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})))


# ═══════════════════════════════════════════════════════════════════════════════
# PURCHASE INVOICES  /purchases/invoices
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/invoices", response_model=PaginatedResponse[PurchaseInvoiceResponse])
async def list_purchase_invoices(
    branch_id:      str | None = Query(default=None),
    status:         str | None = Query(default=None),
    payment_status: str | None = Query(default=None),
    search:         str | None = Query(default=None),
    page:           int = Query(default=1, ge=1),
    page_size:      int = Query(default=20, ge=1, le=100),
    sort_by:        str | None = Query(default="received_at"),
    sort_dir:       str | None = Query(default="desc"),
    current_user:   dict = Depends(get_current_user),
):
    db  = get_db()
    flt = {}

    effective_branch = _branch_scope(current_user, branch_id)
    if effective_branch:    flt["branch_id"]      = effective_branch
    if status:              flt["status"]          = status
    if payment_status:      flt["payment_status"]  = payment_status
    if search:              flt.update(build_search_filter(search, ["supplier_name"]))

    sort_field     = sort_by if sort_by in INVOICE_SORT_FIELDS else "received_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.GRNS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.GRNS]
        .find(flt)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[PurchaseInvoiceResponse](
        data=[PurchaseInvoiceResponse(**doc_to_dict(d)) for d in docs],
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
    if effective_branch:  flt["branch_id"]     = effective_branch
    if status:            flt["status"]         = status
    if payment_status:    flt["payment_status"] = payment_status
    if search:            flt.update(build_search_filter(search, ["supplier_name"]))

    docs   = db[Collections.GRNS].find(flt).sort("received_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Invoice #", "PO #", "Branch", "Supplier", "Items", "Invoice Date", "Status", "Payment Status", "Received At"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("invoice_number", ""),
            d.get("purchase_order_id", ""),
            d.get("branch_id", ""),
            d.get("supplier_name", ""),
            len(d.get("items", [])),
            d.get("invoice_date", "")[:10],
            d.get("status", ""),
            d.get("payment_status", ""),
            d.get("received_at", "")[:10],
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
    doc = db[Collections.GRNS].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    return PurchaseInvoiceResponse(**doc_to_dict(doc))


@router.post("/invoices", response_model=PurchaseInvoiceResponse, status_code=201)
async def create_purchase_invoice(
    payload:      PurchaseInvoiceCreate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    po_doc        = db[Collections.PURCHASE_ORDERS].find_one({"_id": payload.purchase_order_id})
    supplier_name = po_doc.get("supplier_name", "") if po_doc else ""
    channel_name  = po_doc.get("channel_name",  "") if po_doc else ""

    if po_doc and po_doc.get("status") not in ("APPROVED", "PARTIAL"):
        raise HTTPException(
            status_code=400,
            detail="Only APPROVED or PARTIAL purchase orders can have an invoice created",
        )

    all_complete   = all(
        item.received_quantity >= item.ordered_quantity
        for item in payload.items
    )
    invoice_status = "COMPLETED" if all_complete else "PARTIAL"
    po_status      = "RECEIVED"  if all_complete else "PARTIAL"
    invoice_number = _generate_invoice_number(db)

    doc_id       = new_id()
    invoice_data = {
        "_id":                  doc_id,
        **payload.model_dump(),
        "invoice_number":       invoice_number,
        "status":               invoice_status,
        "payment_status":       "UNPAID",
        "payment_entries":      [],
        "supplier_name":        supplier_name,
        "channel_name":         channel_name,
        "received_by":          current_user["id"],
        "received_at":          now,
        "created_at":           now,
        "updated_at":           now,
        **audit_create_fields(current_user),
    }
    db[Collections.GRNS].insert_one(invoice_data)
    db[Collections.PURCHASE_ORDERS].update_one(
        {"_id": payload.purchase_order_id},
        {"$set": {"status": po_status, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="purchase_invoice", resource_id=doc_id,
    )
    return PurchaseInvoiceResponse(**doc_to_dict(invoice_data))


@router.post("/invoices/{invoice_id}/payments", response_model=PurchaseInvoiceResponse)
async def add_payment_entry(
    invoice_id:   str,
    payload:      PaymentEntry,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.GRNS].find_one({"_id": invoice_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")

    existing_entries = doc.get("payment_entries", [])
    existing_entries.append(payload.model_dump())

    # Recalculate payment_status based on total paid vs total invoice amount
    total_items  = doc.get("items", [])
    total_amount = sum(
        item.get("received_quantity", 0) * item.get("unit_price", 0)
        for item in total_items
    )
    total_paid   = sum(e.get("amount", 0) for e in existing_entries)

    if total_paid <= 0:
        payment_status = "UNPAID"
    elif total_paid >= total_amount:
        payment_status = "PAID"
    else:
        payment_status = "PARTIALLY_PAID"

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.GRNS].update_one(
        {"_id": invoice_id},
        {"$set": {
            "payment_entries": existing_entries,
            "payment_status":  payment_status,
            "updated_at":      now,
        }},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="ADD_PAYMENT",
        resource="purchase_invoice", resource_id=invoice_id,
    )
    updated = db[Collections.GRNS].find_one({"_id": invoice_id})
    return PurchaseInvoiceResponse(**doc_to_dict(updated))
