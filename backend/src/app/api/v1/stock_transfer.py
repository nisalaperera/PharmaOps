from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.models.stock_transfer import StockTransferCreate, StockTransferResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/inventory/stock-transfers", tags=["Inventory"])

VALID_SORT_FIELDS = {"created_at", "status", "source_branch_name", "destination_branch_name"}


def _resolve_transfer(data: dict, db) -> dict:
    """Resolve branch names and product names in a transfer document."""
    for branch_field, name_field in [
        ("source_branch_id", "source_branch_name"),
        ("destination_branch_id", "destination_branch_name"),
    ]:
        branch_id = data.get(branch_field)
        if branch_id and not data.get(name_field):
            branch = db[Collections.BRANCHES].find_one({"_id": branch_id}, {"name": 1})
            if branch:
                data[name_field] = branch["name"]

    for item in data.get("items", []):
        if item.get("product_id") and not item.get("product_name"):
            product = db[Collections.PRODUCTS].find_one({"_id": item["product_id"]}, {"name": 1})
            if product:
                item["product_name"] = product["name"]

    return data


@router.get("", response_model=PaginatedResponse[StockTransferResponse])
async def list_transfers(
    page:      int            = Query(default=1, ge=1),
    page_size: int            = Query(default=20, ge=1, le=100),
    status:    Optional[str]  = Query(default=None),
    sort_by:   Optional[str]  = Query(default="created_at"),
    sort_dir:  Optional[str]  = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filt:  dict = {}

    if status:
        filt["status"] = status

    sort_field = sort_by if sort_by in VALID_SORT_FIELDS else "created_at"
    sort_order = 1 if sort_dir == "asc" else -1

    total = db[Collections.STOCK_TRANSFERS].count_documents(filt)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.STOCK_TRANSFERS]
        .find(filt)
        .sort(sort_field, sort_order)
        .skip(skip)
        .limit(page_size)
    )
    items = [StockTransferResponse(**_resolve_transfer(doc_to_dict(d), db)) for d in docs]

    return PaginatedResponse[StockTransferResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=StockTransferResponse, status_code=201)
async def create_transfer(
    payload: StockTransferCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id": doc_id, **payload.model_dump(),
        "status": "PENDING", "initiated_by": current_user["id"],
        "created_at": now, "updated_at": now,
    }
    _resolve_transfer(data, db)
    db[Collections.STOCK_TRANSFERS].insert_one(data)
    return StockTransferResponse(**doc_to_dict(data))


@router.post("/{transfer_id}/confirm", response_model=StockTransferResponse)
async def confirm_transfer(
    transfer_id: str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db       = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if existing["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Only PENDING transfers can be confirmed")
    now = datetime.now(timezone.utc).isoformat()
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "CONFIRMED", "confirmed_by": current_user["id"], "confirmed_at": now, "updated_at": now}},
    )
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))


@router.post("/{transfer_id}/reject", response_model=StockTransferResponse)
async def reject_transfer(
    transfer_id: str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db       = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if existing["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Only PENDING transfers can be rejected")
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "REJECTED", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))


@router.post("/{transfer_id}/cancel", response_model=StockTransferResponse)
async def cancel_transfer(
    transfer_id: str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db       = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if existing["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Only PENDING transfers can be cancelled")
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "CANCELLED", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))
