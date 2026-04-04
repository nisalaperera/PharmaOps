from fastapi import APIRouter, HTTPException, Depends, Query
from app.database import get_db, Collections, doc_to_dict
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.models.inventory import InventoryResponse, InventoryUpdate
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.get("", response_model=PaginatedResponse[InventoryResponse])
async def list_inventory(
    branch_id:  str | None  = Query(default=None),
    low_stock:  bool | None = Query(default=None),
    search:     str | None  = Query(default=None),
    page:       int = Query(default=1, ge=1),
    page_size:  int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch:      filter["branch_id"]   = effective_branch
    if low_stock is not None: filter["is_low_stock"] = low_stock
    if search:                filter["product_name"] = {"$regex": search, "$options": "i"}

    total = db[Collections.INVENTORY].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.INVENTORY].find(filter).skip(skip).limit(page_size)
    items = [InventoryResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[InventoryResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.get("/{inventory_id}", response_model=InventoryResponse)
async def get_inventory_item(inventory_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.INVENTORY].find_one({"_id": inventory_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    return InventoryResponse(**doc_to_dict(doc))


@router.patch("/{inventory_id}", response_model=InventoryResponse)
async def update_inventory(
    inventory_id: str,
    payload:      InventoryUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    if not db[Collections.INVENTORY].find_one({"_id": inventory_id}):
        raise HTTPException(status_code=404, detail="Inventory record not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})
    return InventoryResponse(**doc_to_dict(db[Collections.INVENTORY].find_one({"_id": inventory_id})))
