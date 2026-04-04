from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.models.stock_transfer import StockTransferCreate, StockTransferResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/stock-transfers", tags=["Stock Transfers"])


@router.get("", response_model=PaginatedResponse[StockTransferResponse])
async def list_transfers(
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db    = get_db()
    total = db[Collections.STOCK_TRANSFERS].count_documents({})
    skip  = (page - 1) * page_size
    docs  = db[Collections.STOCK_TRANSFERS].find().sort("created_at", -1).skip(skip).limit(page_size)
    items = [StockTransferResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[StockTransferResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=StockTransferResponse, status_code=201)
async def create_transfer(payload: StockTransferCreate, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id": doc_id, **payload.model_dump(),
        "status": "PENDING", "initiated_by": current_user["id"],
        "created_at": now, "updated_at": now,
    }
    db[Collections.STOCK_TRANSFERS].insert_one(data)
    return StockTransferResponse(**doc_to_dict(data))


@router.post("/{transfer_id}/confirm", response_model=StockTransferResponse)
async def confirm_transfer(transfer_id: str, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db = get_db()
    if not db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id}):
        raise HTTPException(status_code=404, detail="Transfer not found")
    now = datetime.now(timezone.utc).isoformat()
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "CONFIRMED", "confirmed_by": current_user["id"], "confirmed_at": now, "updated_at": now}},
    )
    return StockTransferResponse(**doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})))


@router.post("/{transfer_id}/reject", response_model=StockTransferResponse)
async def reject_transfer(transfer_id: str, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db = get_db()
    if not db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id}):
        raise HTTPException(status_code=404, detail="Transfer not found")
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "REJECTED", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return StockTransferResponse(**doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})))
