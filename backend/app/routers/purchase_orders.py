from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timezone
from app.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.models.purchase_order import (
    PurchaseOrderCreate, PurchaseOrderResponse,
    GRNCreate, GRNResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


@router.get("", response_model=PaginatedResponse[PurchaseOrderResponse])
async def list_purchase_orders(
    branch_id:     str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    page:          int = Query(default=1, ge=1),
    page_size:     int = Query(default=20, ge=1, le=100),
    current_user:  dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch: filter["branch_id"] = effective_branch
    if status_filter:    filter["status"]    = status_filter

    total = db[Collections.PURCHASE_ORDERS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.PURCHASE_ORDERS].find(filter).sort("created_at", -1).skip(skip).limit(page_size)
    pos   = [PurchaseOrderResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[PurchaseOrderResponse](
        data=pos, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(payload: PurchaseOrderCreate, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    items_data = []
    total      = 0.0
    for item in payload.items:
        item_total = item.quantity * item.unit_price
        total     += item_total
        items_data.append({**item.model_dump(), "total_price": item_total})

    doc_id = new_id()
    data = {
        "_id":          doc_id,
        **payload.model_dump(exclude={"items"}),
        "items":        items_data,
        "total_amount": total,
        "status":       "DRAFT",
        "created_by":   current_user["id"],
        "created_at":   now,
        "updated_at":   now,
    }
    db[Collections.PURCHASE_ORDERS].insert_one(data)
    return PurchaseOrderResponse(**doc_to_dict(data))


@router.post("/{po_id}/submit", response_model=PurchaseOrderResponse)
async def submit_for_approval(po_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if not db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id}):
        raise HTTPException(status_code=404, detail="Purchase order not found")
    db[Collections.PURCHASE_ORDERS].update_one(
        {"_id": po_id},
        {"$set": {"status": "PENDING_APPROVAL", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return PurchaseOrderResponse(**doc_to_dict(db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})))


@router.post("/{po_id}/approve", response_model=PurchaseOrderResponse)
async def approve_purchase_order(po_id: str, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db = get_db()
    if not db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id}):
        raise HTTPException(status_code=404, detail="Purchase order not found")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PURCHASE_ORDERS].update_one(
        {"_id": po_id},
        {"$set": {"status": "APPROVED", "approved_by": current_user["id"], "approved_at": now, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="APPROVE",
        resource="purchase_order", resource_id=po_id,
    )
    return PurchaseOrderResponse(**doc_to_dict(db[Collections.PURCHASE_ORDERS].find_one({"_id": po_id})))


@router.post("/grn", response_model=GRNResponse, status_code=201)
async def create_grn(payload: GRNCreate, current_user: dict = Depends(require_min_role("BRANCH_USER"))):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()

    grn_data = {
        "_id":         doc_id,
        **payload.model_dump(),
        "status":      "COMPLETED",
        "received_by": current_user["id"],
        "received_at": now,
        "created_at":  now,
    }
    db[Collections.GRNS].insert_one(grn_data)
    db[Collections.PURCHASE_ORDERS].update_one(
        {"_id": payload.purchase_order_id},
        {"$set": {"status": "RECEIVED", "updated_at": now}},
    )
    return GRNResponse(**doc_to_dict(grn_data))
