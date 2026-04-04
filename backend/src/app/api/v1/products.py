from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.models.product import (
    ProductCreate, ProductUpdate, ProductResponse,
    ProductGenericCreate, ProductGenericResponse,
    ProductBrandCreate, ProductBrandResponse,
    ProductCategoryCreate, ProductCategoryResponse,
    ProductUnitCreate, ProductUnitResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/products", tags=["Products"])


def _simple_list(collection: str, response_model):
    db   = get_db()
    docs = db[collection].find()
    return [response_model(**doc_to_dict(d)) for d in docs]


def _simple_create(collection: str, payload, response_model):
    db    = get_db()
    doc_id = new_id()
    data  = {"_id": doc_id, **payload.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    db[collection].insert_one(data)
    return response_model(**doc_to_dict(data))


# ─── Sub-catalog ──────────────────────────────────────────────────────────────

@router.get("/generics", response_model=list[ProductGenericResponse])
async def list_generics(current_user: dict = Depends(get_current_user)):
    return _simple_list(Collections.GENERICS, ProductGenericResponse)

@router.post("/generics", response_model=ProductGenericResponse, status_code=201)
async def create_generic(payload: ProductGenericCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    return _simple_create(Collections.GENERICS, payload, ProductGenericResponse)


@router.get("/brands", response_model=list[ProductBrandResponse])
async def list_brands(current_user: dict = Depends(get_current_user)):
    return _simple_list(Collections.BRANDS, ProductBrandResponse)

@router.post("/brands", response_model=ProductBrandResponse, status_code=201)
async def create_brand(payload: ProductBrandCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    return _simple_create(Collections.BRANDS, payload, ProductBrandResponse)


@router.get("/categories", response_model=list[ProductCategoryResponse])
async def list_categories(current_user: dict = Depends(get_current_user)):
    return _simple_list(Collections.CATEGORIES, ProductCategoryResponse)

@router.post("/categories", response_model=ProductCategoryResponse, status_code=201)
async def create_category(payload: ProductCategoryCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    return _simple_create(Collections.CATEGORIES, payload, ProductCategoryResponse)


@router.get("/units", response_model=list[ProductUnitResponse])
async def list_units(current_user: dict = Depends(get_current_user)):
    return _simple_list(Collections.UNITS, ProductUnitResponse)

@router.post("/units", response_model=ProductUnitResponse, status_code=201)
async def create_unit(payload: ProductUnitCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    return _simple_create(Collections.UNITS, payload, ProductUnitResponse)


# ─── Products ─────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[ProductResponse])
async def list_products(
    page:        int  = Query(default=1, ge=1),
    page_size:   int  = Query(default=20, ge=1, le=100),
    search:      str | None  = Query(default=None),
    category_id: str | None  = Query(default=None),
    brand_id:    str | None  = Query(default=None),
    is_active:   bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    if category_id:            filter["category_id"] = category_id
    if brand_id:               filter["brand_id"]    = brand_id
    if is_active is not None:  filter["is_active"]   = is_active
    if search:
        filter.update(build_search_filter(search, ["name", "barcode", "sku"]))

    total    = db[Collections.PRODUCTS].count_documents(filter)
    skip     = (page - 1) * page_size
    docs     = db[Collections.PRODUCTS].find(filter).skip(skip).limit(page_size)
    products = [ProductResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[ProductResponse](
        data=products, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(payload: ProductCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now, "updated_at": now}
    db[Collections.PRODUCTS].insert_one(data)
    return ProductResponse(**doc_to_dict(data))


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.PRODUCTS].find_one({"_id": product_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductResponse(**doc_to_dict(doc))


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, payload: ProductUpdate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db = get_db()
    if not db[Collections.PRODUCTS].find_one({"_id": product_id}):
        raise HTTPException(status_code=404, detail="Product not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    db[Collections.PRODUCTS].update_one({"_id": product_id}, {"$set": updates})
    return ProductResponse(**doc_to_dict(db[Collections.PRODUCTS].find_one({"_id": product_id})))
