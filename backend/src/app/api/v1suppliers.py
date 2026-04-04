from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timezone
from app.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.models.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("", response_model=PaginatedResponse[SupplierResponse])
async def list_suppliers(
    page:      int  = Query(default=1, ge=1),
    page_size: int  = Query(default=20, ge=1, le=100),
    search:    str | None  = Query(default=None),
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}
    if is_active is not None: filter["is_active"] = is_active
    if search: filter.update(build_search_filter(search, ["name"]))

    total     = db[Collections.SUPPLIERS].count_documents(filter)
    skip      = (page - 1) * page_size
    docs      = db[Collections.SUPPLIERS].find(filter).skip(skip).limit(page_size)
    suppliers = [SupplierResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[SupplierResponse](
        data=suppliers, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=SupplierResponse, status_code=201)
async def create_supplier(payload: SupplierCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data = {"_id": doc_id, **payload.model_dump(), "created_at": now, "updated_at": now}
    db[Collections.SUPPLIERS].insert_one(data)
    return SupplierResponse(**doc_to_dict(data))


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.SUPPLIERS].find_one({"_id": supplier_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierResponse(**doc_to_dict(doc))


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(supplier_id: str, payload: SupplierUpdate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db = get_db()
    if not db[Collections.SUPPLIERS].find_one({"_id": supplier_id}):
        raise HTTPException(status_code=404, detail="Supplier not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    db[Collections.SUPPLIERS].update_one({"_id": supplier_id}, {"$set": updates})
    return SupplierResponse(**doc_to_dict(db[Collections.SUPPLIERS].find_one({"_id": supplier_id})))
