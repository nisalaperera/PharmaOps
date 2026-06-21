from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io, re
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.branch_scope import effective_branch_id, ensure_branch_access, enforce_branch_on_create, BRANCH_LEVEL_ROLES
from app.utils.sequences import generate_document_number, get_branch_code
from app.models.purchase_order import (
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/purchases", tags=["Purchases"])

PURCHASE_ORDER_SORT_FIELDS = {"created_at", "updated_at", "total_amount", "return_amount", "status", "supplier_name", "order_date", "order_number"}


def _generate_order_number(db, branch_id: str, order_date: str) -> str:
    branch_code = get_branch_code(db, branch_id)
    return generate_document_number(db, branch_code, "PO", ref_date=order_date)


def _compute_item_totals(items: list) -> tuple[list, float]:
    """Compute line_total for each item; return (items_data, grand_total)."""
    items_data = []
    total      = 0.0
    for item in items:
        item_dict  = item if isinstance(item, dict) else item.model_dump()
        line_total = item_dict.get("unit_quantity", 0) * item_dict.get("unit_price", 0) - item_dict.get("discount", 0)
        total     += line_total
        items_data.append({**item_dict, "line_total": line_total})
    return items_data, total


def _compute_return_totals(return_items: list) -> tuple[list, float]:
    """Compute line_total for each return item; return (return_items_data, grand_return)."""
    items_data    = []
    return_amount = 0.0
    for item in return_items:
        item_dict  = item if isinstance(item, dict) else item.model_dump()
        line_total = item_dict.get("unit_quantity", 0) * item_dict.get("unit_price", 0)
        return_amount += line_total
        items_data.append({**item_dict, "line_total": line_total})
    return items_data, return_amount


# ═══════════════════════════════════════════════════════════════════════════════
# PURCHASE ORDERS  /purchases/orders
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/orders", response_model=PaginatedResponse[PurchaseOrderResponse])
async def list_purchase_orders(
    branch_id:  str | None = Query(default=None),
    status:     str | None = Query(default=None),
    search:     str | None = Query(default=None),
    page:       int = Query(default=1, ge=1),
    page_size:  int = Query(default=20, ge=1, le=500),
    sort_by:    str | None = Query(default="created_at"),
    sort_dir:   str | None = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    bid = effective_branch_id(current_user, branch_id)
    if bid:              filter["branch_id"] = bid
    if status:           filter["status"]    = status
    if search:           filter.update(build_search_filter(search, ["supplier_name", "channel_name", "order_number"]))

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

    bid = effective_branch_id(current_user, branch_id)
    if bid:              filter["branch_id"] = bid
    if status:           filter["status"]    = status
    if search:           filter.update(build_search_filter(search, ["supplier_name", "channel_name", "order_number"]))

    docs   = db[Collections.PURCHASE_ORDERS].find(filter).sort("created_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Order Number", "Branch", "Supplier", "Channel", "Items", "Total Amount", "Return Amount", "Status", "Order Date", "Created At"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("order_number", ""),
            d.get("branch_id", ""),
            d.get("supplier_name", ""),
            d.get("channel_name", ""),
            len(d.get("items", [])),
            f"{d.get('total_amount', 0):.2f}",
            f"{d.get('return_amount', 0):.2f}",
            d.get("status", ""),
            d.get("order_date", "")[:10],
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

    payload.branch_id = enforce_branch_on_create(payload.branch_id, current_user)

    supplier_doc     = db[Collections.SUPPLIERS].find_one({"_id": payload.supplier_id, "supplier_type": "DISTRIBUTOR"})
    supplier_name    = supplier_doc.get("short_name", "") if supplier_doc else ""
    channel_name     = ""
    credit_term_days = 30
    if supplier_doc:
        for ch in supplier_doc.get("distributor_channels", []):
            if str(ch.get("id", "")) == payload.channel_id or ch.get("_id") == payload.channel_id:
                channel_name     = ch.get("channel_name", "")
                credit_term_days = ch.get("credit_term_days", 30)
                break

    order_date             = payload.order_date
    order_number           = _generate_order_number(db, payload.branch_id, order_date)
    items_data, total      = _compute_item_totals(payload.items)
    return_data, ret_total = _compute_return_totals(payload.return_items)

    doc_id = new_id()
    data = {
        "_id":             doc_id,
        **payload.model_dump(exclude={"items", "return_items"}),
        "order_number":    order_number,
        "supplier_name":   supplier_name,
        "channel_name":    channel_name,
        "credit_term_days": credit_term_days,
        "items":           items_data,
        "return_items":    return_data,
        "total_amount":    total,
        "return_amount":   ret_total,
        "status":          "DRAFT",
        "created_by":      current_user["id"],
        "created_at":      now,
        "updated_at":      now,
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
    ensure_branch_access(doc_to_dict(doc), current_user)
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
    ensure_branch_access(doc_to_dict(doc), current_user)
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
    ensure_branch_access(doc_to_dict(doc), current_user)
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
    ensure_branch_access(doc_to_dict(doc), current_user)
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
    ensure_branch_access(doc_to_dict(doc), current_user)
    if doc["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT orders can be edited")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}

    if "items" in updates:
        items_data, total            = _compute_item_totals(updates["items"])
        updates["items"]             = items_data
        updates["total_amount"]      = total

    if "return_items" in updates:
        return_data, ret_total       = _compute_return_totals(updates["return_items"])
        updates["return_items"]      = return_data
        updates["return_amount"]     = ret_total

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.PURCHASE_ORDERS].update_one({"_id": po_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="purchase_order", resource_id=po_id,
    )
    return PurchaseOrderResponse(**doc_to_dict(db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})))
