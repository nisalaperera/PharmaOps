import csv
import io
import re
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from pymongo import ASCENDING, DESCENDING
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.models.product import (
    ProductCreate, ProductUpdate, ProductResponse,
    ProductGenericCreate, ProductGenericUpdate, ProductGenericResponse,
    ProductBrandCreate, ProductBrandUpdate, ProductBrandResponse,
    ProductCategoryCreate, ProductCategoryUpdate, ProductCategoryResponse,
    ProductSkuCreate, ProductSkuUpdate, ProductSkuResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/products", tags=["Products"])

PRODUCT_SORT_FIELDS = {"name", "brand_name", "category_name", "generic_name", "created_at", "last_modified_at"}


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _simple_list(collection: str, response_model):
    db   = get_db()
    docs = db[collection].find().sort("name", ASCENDING)
    return [response_model(**doc_to_dict(d)) for d in docs]


def _simple_create(collection: str, payload, response_model):
    db     = get_db()
    doc_id = new_id()
    now    = datetime.now(timezone.utc).isoformat()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now}
    db[collection].insert_one(data)
    return response_model(**doc_to_dict(data))


def _lookup_name(collection: str, doc_id: str) -> str:
    db  = get_db()
    doc = db[collection].find_one({"_id": doc_id})
    return doc["name"] if doc else ""


def _lookup_id_by_name(collection: str, name: str) -> str | None:
    """Case-insensitive exact-name lookup; returns _id or None."""
    db  = get_db()
    doc = db[collection].find_one({"name": {"$regex": f"^{re.escape(name.strip())}$", "$options": "i"}})
    return doc["_id"] if doc else None


def _csv_response(output: io.StringIO, filename: str) -> StreamingResponse:
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _decode_csv_upload(raw_bytes: bytes) -> csv.DictReader:
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")
    return csv.DictReader(io.StringIO(text))


def _parse_bool(value: str, default: bool = False) -> bool:
    return value.strip().upper() not in ("FALSE", "0", "NO", "INACTIVE") if value.strip() else default


# ─── Sub-catalog: Generics ────────────────────────────────────────────────────

@router.get("/generics", response_model=list[ProductGenericResponse])
async def list_generics(
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = {} if is_active is None else {"is_active": is_active}
    docs = db[Collections.GENERICS].find(filt).sort("name", ASCENDING)
    return [ProductGenericResponse(**doc_to_dict(d)) for d in docs]

@router.post("/generics", response_model=ProductGenericResponse, status_code=201)
async def create_generic(payload: ProductGenericCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db = get_db()
    if db[Collections.GENERICS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A generic named '{payload.name}' already exists.")
    return _simple_create(Collections.GENERICS, payload, ProductGenericResponse)

@router.get("/generics/export")
async def export_generics(current_user: dict = Depends(get_current_user)):
    db     = get_db()
    docs   = db[Collections.GENERICS].find().sort("name", ASCENDING)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "description"])
    for d in docs:
        writer.writerow([d.get("name", ""), d.get("description") or ""])
    return _csv_response(output, "generics_export.csv")

@router.get("/generics/import/template")
async def generics_import_template(current_user: dict = Depends(require_min_role("MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "description"])
    writer.writerow(["Paracetamol",  "Common analgesic and antipyretic"])
    writer.writerow(["Amoxicillin",  "Broad-spectrum antibiotic"])
    writer.writerow(["Metformin",    "Biguanide antidiabetic"])
    return _csv_response(output, "generics_import_template.csv")

@router.post("/generics/import")
async def import_generics(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db     = get_db()
    reader = _decode_csv_upload(await file.read())
    if "name" not in (reader.fieldnames or []):
        raise HTTPException(status_code=400, detail="CSV must include a 'name' column")

    created, updated, failed, errors = 0, 0, 0, []
    for row_num, row in enumerate(reader, start=2):
        name = (row.get("name") or "").strip()
        if not name:
            errors.append({"row": row_num, "message": "name is required"}); failed += 1; continue
        description = (row.get("description") or "").strip() or None
        existing = db[Collections.GENERICS].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        if existing:
            db[Collections.GENERICS].update_one(
                {"_id": existing["_id"]},
                {"$set": {"name": name, "description": description,
                           "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            updated += 1
        else:
            db[Collections.GENERICS].insert_one({
                "_id": new_id(), "name": name, "description": description,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}

@router.patch("/generics/{generic_id}", response_model=ProductGenericResponse)
async def update_generic(
    generic_id: str, payload: ProductGenericUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    if not db[Collections.GENERICS].find_one({"_id": generic_id}):
        raise HTTPException(status_code=404, detail="Generic not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "name" in updates:
        duplicate = db[Collections.GENERICS].find_one({
            "name": {"$regex": f"^{re.escape(updates['name'].strip())}$", "$options": "i"},
            "_id":  {"$ne": generic_id},
        })
        if duplicate:
            raise HTTPException(status_code=409, detail=f"A generic named '{updates['name']}' already exists.")
    db[Collections.GENERICS].update_one({"_id": generic_id}, {"$set": updates})
    return ProductGenericResponse(**doc_to_dict(db[Collections.GENERICS].find_one({"_id": generic_id})))


# ─── Sub-catalog: Brands ──────────────────────────────────────────────────────

@router.get("/brands", response_model=list[ProductBrandResponse])
async def list_brands(
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = {} if is_active is None else {"is_active": is_active}
    docs = db[Collections.BRANDS].find(filt).sort("name", ASCENDING)
    return [ProductBrandResponse(**doc_to_dict(d)) for d in docs]

@router.post("/brands", response_model=ProductBrandResponse, status_code=201)
async def create_brand(payload: ProductBrandCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db = get_db()
    if db[Collections.BRANDS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A brand named '{payload.name}' already exists.")
    return _simple_create(Collections.BRANDS, payload, ProductBrandResponse)

@router.get("/brands/export")
async def export_brands(current_user: dict = Depends(get_current_user)):
    db     = get_db()
    docs   = db[Collections.BRANDS].find().sort("name", ASCENDING)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "manufacturer_name", "description"])
    for d in docs:
        writer.writerow([d.get("name", ""), d.get("manufacturer_name") or "", d.get("description") or ""])
    return _csv_response(output, "brands_export.csv")

@router.get("/brands/import/template")
async def brands_import_template(current_user: dict = Depends(require_min_role("MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "manufacturer_name", "description"])
    writer.writerow(["Panadol",   "Haleon plc",          "Analgesic and antipyretic brand"])
    writer.writerow(["Augmentin", "GlaxoSmithKline",     "Broad-spectrum antibiotic brand"])
    writer.writerow(["Brufen",    "Abbott Laboratories",  "Anti-inflammatory brand"])
    return _csv_response(output, "brands_import_template.csv")

@router.post("/brands/import")
async def import_brands(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db     = get_db()
    reader = _decode_csv_upload(await file.read())
    if "name" not in (reader.fieldnames or []):
        raise HTTPException(status_code=400, detail="CSV must include a 'name' column")

    created, updated, failed, errors = 0, 0, 0, []
    for row_num, row in enumerate(reader, start=2):
        name = (row.get("name") or "").strip()
        if not name:
            errors.append({"row": row_num, "message": "name is required"}); failed += 1; continue
        manufacturer_name = (row.get("manufacturer_name") or "").strip() or None
        description       = (row.get("description")       or "").strip() or None
        existing = db[Collections.BRANDS].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        if existing:
            db[Collections.BRANDS].update_one(
                {"_id": existing["_id"]},
                {"$set": {"name": name, "manufacturer_name": manufacturer_name,
                           "description": description,
                           "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            updated += 1
        else:
            db[Collections.BRANDS].insert_one({
                "_id": new_id(), "name": name, "manufacturer_name": manufacturer_name,
                "description": description, "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}

@router.patch("/brands/{brand_id}", response_model=ProductBrandResponse)
async def update_brand(
    brand_id: str, payload: ProductBrandUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    if not db[Collections.BRANDS].find_one({"_id": brand_id}):
        raise HTTPException(status_code=404, detail="Brand not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "name" in updates:
        duplicate = db[Collections.BRANDS].find_one({
            "name": {"$regex": f"^{re.escape(updates['name'].strip())}$", "$options": "i"},
            "_id":  {"$ne": brand_id},
        })
        if duplicate:
            raise HTTPException(status_code=409, detail=f"A brand named '{updates['name']}' already exists.")
    db[Collections.BRANDS].update_one({"_id": brand_id}, {"$set": updates})
    return ProductBrandResponse(**doc_to_dict(db[Collections.BRANDS].find_one({"_id": brand_id})))


# ─── Sub-catalog: Categories ──────────────────────────────────────────────────

def _resolve_categories(db, filt: dict | None = None) -> list[ProductCategoryResponse]:
    docs       = list(db[Collections.CATEGORIES].find(filt or {}).sort("name", ASCENDING))
    id_to_name = {str(d["_id"]): d["name"] for d in docs}
    result     = []
    for d in docs:
        cat              = doc_to_dict(d)
        cat["parent_name"] = id_to_name.get(cat.get("parent_id") or "") or None
        result.append(ProductCategoryResponse(**cat))
    return result


def _get_category_descendants(db, category_id: str) -> set:
    descendants, queue = set(), [category_id]
    while queue:
        current  = queue.pop()
        children = db[Collections.CATEGORIES].find({"parent_id": current}, {"_id": 1})
        for child in children:
            child_id = str(child["_id"])
            if child_id not in descendants:
                descendants.add(child_id)
                queue.append(child_id)
    return descendants


@router.get("/categories", response_model=list[ProductCategoryResponse])
async def list_categories(
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = {} if is_active is None else {"is_active": is_active}
    return _resolve_categories(db, filt)


@router.post("/categories", response_model=ProductCategoryResponse, status_code=201)
async def create_category(
    payload:      ProductCategoryCreate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    if payload.parent_id and not db[Collections.CATEGORIES].find_one({"_id": payload.parent_id}):
        raise HTTPException(status_code=404, detail="Parent category not found")
    if db[Collections.CATEGORIES].find_one({
        "name":      {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"},
        "parent_id": payload.parent_id,
    }):
        scope = f"under the same parent" if payload.parent_id else "at the top level"
        raise HTTPException(status_code=409, detail=f"A category named '{payload.name}' already exists {scope}.")
    doc_id = new_id()
    now    = datetime.now(timezone.utc).isoformat()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now}
    db[Collections.CATEGORIES].insert_one(data)
    cat              = doc_to_dict(data)
    cat["parent_name"] = _lookup_name(Collections.CATEGORIES, payload.parent_id) if payload.parent_id else None
    return ProductCategoryResponse(**cat)


@router.get("/categories/export")
async def export_categories(current_user: dict = Depends(get_current_user)):
    db     = get_db()
    docs   = db[Collections.CATEGORIES].find().sort("name", ASCENDING)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "description", "parent_name"])
    id_to_name = {str(d["_id"]): d["name"] for d in db[Collections.CATEGORIES].find({}, {"name": 1})}
    for d in docs:
        writer.writerow([
            d.get("name", ""),
            d.get("description") or "",
            id_to_name.get(d.get("parent_id") or "") or "",
        ])
    return _csv_response(output, "categories_export.csv")


@router.get("/categories/import/template")
async def categories_import_template(current_user: dict = Depends(require_min_role("MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "description", "parent_name", "is_active"])
    writer.writerow(["Analgesics",      "Pain relief medications",             "",            "true"])
    writer.writerow(["Antibiotics",     "Medications to treat bacterial infections", "",      "true"])
    writer.writerow(["IV Antibiotics",  "Intravenous antibiotic treatments",   "Antibiotics", "true"])
    writer.writerow(["Antidiabetics",   "Medications to manage blood sugar",   "",            "false"])
    return _csv_response(output, "categories_import_template.csv")


@router.post("/categories/import")
async def import_categories(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db     = get_db()
    reader = _decode_csv_upload(await file.read())
    if "name" not in (reader.fieldnames or []):
        raise HTTPException(status_code=400, detail="CSV must include a 'name' column")

    created, updated, failed, errors = 0, 0, 0, []
    for row_num, row in enumerate(reader, start=2):
        name = (row.get("name") or "").strip()
        if not name:
            errors.append({"row": row_num, "message": "name is required"}); failed += 1; continue
        description = (row.get("description") or "").strip() or None
        is_active   = _parse_bool(row.get("is_active") or "TRUE", default=True)

        parent_name = (row.get("parent_name") or "").strip() or None
        parent_id   = None
        if parent_name:
            parent_id = _lookup_id_by_name(Collections.CATEGORIES, parent_name)
            if not parent_id:
                errors.append({"row": row_num, "message": f"parent category '{parent_name}' not found"}); failed += 1; continue

        existing = db[Collections.CATEGORIES].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        if existing:
            db[Collections.CATEGORIES].update_one(
                {"_id": existing["_id"]},
                {"$set": {"name": name, "description": description, "parent_id": parent_id,
                           "is_active": is_active,
                           "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            updated += 1
        else:
            db[Collections.CATEGORIES].insert_one({
                "_id": new_id(), "name": name, "description": description, "parent_id": parent_id,
                "is_active": is_active, "created_at": datetime.now(timezone.utc).isoformat(),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}


@router.patch("/categories/{category_id}", response_model=ProductCategoryResponse)
async def update_category(
    category_id:  str,
    payload:      ProductCategoryUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    if not db[Collections.CATEGORIES].find_one({"_id": category_id}):
        raise HTTPException(status_code=404, detail="Category not found")

    updates = payload.model_dump(exclude_unset=True)

    if "parent_id" in updates and updates["parent_id"] is not None:
        if updates["parent_id"] == category_id:
            raise HTTPException(status_code=400, detail="A category cannot be its own parent")
        if not db[Collections.CATEGORIES].find_one({"_id": updates["parent_id"]}):
            raise HTTPException(status_code=404, detail="Parent category not found")
        if updates["parent_id"] in _get_category_descendants(db, category_id):
            raise HTTPException(status_code=400, detail="Cannot set a descendant as the parent (circular reference)")

    if "name" in updates or "parent_id" in updates:
        existing        = db[Collections.CATEGORIES].find_one({"_id": category_id})
        effective_name  = updates.get("name",      existing["name"])
        effective_pid   = updates.get("parent_id", existing.get("parent_id"))
        duplicate = db[Collections.CATEGORIES].find_one({
            "name":      {"$regex": f"^{re.escape(effective_name.strip())}$", "$options": "i"},
            "parent_id": effective_pid,
            "_id":       {"$ne": category_id},
        })
        if duplicate:
            scope = "under the same parent" if effective_pid else "at the top level"
            raise HTTPException(status_code=409, detail=f"A category named '{effective_name}' already exists {scope}.")

    if updates:
        db[Collections.CATEGORIES].update_one({"_id": category_id}, {"$set": updates})

    doc              = doc_to_dict(db[Collections.CATEGORIES].find_one({"_id": category_id}))
    doc["parent_name"] = _lookup_name(Collections.CATEGORIES, doc.get("parent_id")) if doc.get("parent_id") else None
    return ProductCategoryResponse(**doc)


# ─── Sub-catalog: SKUs ────────────────────────────────────────────────────────

VALID_SKU_TYPES = {"COUNT", "VOLUME", "WEIGHT", "LENGTH"}

@router.get("/skus", response_model=list[ProductSkuResponse])
async def list_skus(
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = {}
    if is_active is not None:
        filt["is_active"] = is_active
    docs = db[Collections.SKUS].find(filt).sort("name", ASCENDING)
    return [ProductSkuResponse(**doc_to_dict(d)) for d in docs]

@router.post("/skus", response_model=ProductSkuResponse, status_code=201)
async def create_sku(payload: ProductSkuCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db = get_db()
    if db[Collections.SKUS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A SKU named '{payload.name}' already exists.")
    return _simple_create(Collections.SKUS, payload, ProductSkuResponse)

@router.get("/skus/export")
async def export_skus(
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = {}
    if is_active is not None:
        filt["is_active"] = is_active
    docs   = db[Collections.SKUS].find(filt).sort("name", ASCENDING)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "plural", "sku_type", "is_active"])
    for d in docs:
        writer.writerow([
            d.get("name", ""),
            d.get("plural") or "",
            d.get("sku_type") or d.get("unit_type", "COUNT"),
            "TRUE" if d.get("is_active", True) else "FALSE",
        ])
    return _csv_response(output, "skus_export.csv")

@router.get("/skus/import/template")
async def skus_import_template(current_user: dict = Depends(require_min_role("MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "plural", "sku_type", "is_active"])
    writer.writerow(["Tablet",     "Tablets",     "COUNT",  "TRUE"])
    writer.writerow(["Capsule",    "Capsules",    "COUNT",  "TRUE"])
    writer.writerow(["Millilitre", "Millilitres", "VOLUME", "TRUE"])
    writer.writerow(["Milligram",  "Milligrams",  "WEIGHT", "TRUE"])
    writer.writerow(["Strip",      "Strips",      "COUNT",  "TRUE"])
    writer.writerow(["Bottle",     "Bottles",     "COUNT",  "TRUE"])
    return _csv_response(output, "skus_import_template.csv")

@router.post("/skus/import")
async def import_skus(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db     = get_db()
    reader = _decode_csv_upload(await file.read())
    required = {"name", "sku_type"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise HTTPException(status_code=400, detail=f"CSV must include columns: {', '.join(sorted(required))}")

    created, updated, failed, errors = 0, 0, 0, []
    for row_num, row in enumerate(reader, start=2):
        name     = (row.get("name")     or "").strip()
        plural   = (row.get("plural")   or "").strip() or None
        sku_type = (row.get("sku_type") or "").strip().upper()

        row_errors = []
        if not name:     row_errors.append("name is required")
        if not sku_type: row_errors.append("sku_type is required")
        elif sku_type not in VALID_SKU_TYPES:
            row_errors.append(f"sku_type must be one of: {', '.join(sorted(VALID_SKU_TYPES))}")
        if row_errors:
            errors.append({"row": row_num, "message": "; ".join(row_errors)}); failed += 1; continue

        is_active = _parse_bool(row.get("is_active") or "TRUE", default=True)
        existing  = db[Collections.SKUS].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        if existing:
            db[Collections.SKUS].update_one(
                {"_id": existing["_id"]},
                {"$set": {"name": name, "plural": plural, "sku_type": sku_type,
                           "is_active": is_active,
                           "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            updated += 1
        else:
            db[Collections.SKUS].insert_one({
                "_id": new_id(), "name": name, "plural": plural,
                "sku_type": sku_type, "is_active": is_active,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}

@router.patch("/skus/{sku_id}", response_model=ProductSkuResponse)
async def update_sku(
    sku_id: str, payload: ProductSkuUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    if not db[Collections.SKUS].find_one({"_id": sku_id}):
        raise HTTPException(status_code=404, detail="SKU not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "name" in updates:
        if db[Collections.SKUS].find_one({
            "name": {"$regex": f"^{re.escape(updates['name'].strip())}$", "$options": "i"},
            "_id":  {"$ne": sku_id},
        }):
            raise HTTPException(status_code=409, detail=f"A SKU named '{updates['name']}' already exists.")
    db[Collections.SKUS].update_one({"_id": sku_id}, {"$set": updates})
    return ProductSkuResponse(**doc_to_dict(db[Collections.SKUS].find_one({"_id": sku_id})))


# ─── SKU mapping helpers ──────────────────────────────────────────────────────

def _compute_basic_counts(mappings: list[dict]) -> list[int]:
    """Resolve basic_sku_count for each mapping entry by following the chain."""
    counts = [0] * len(mappings)
    for i, m in enumerate(mappings):
        if m["mapped_sku"] == "basic":
            counts[i] = m["mapped_sku_count"]
    for _ in range(len(mappings)):
        for i, m in enumerate(mappings):
            if m["mapped_sku"] != "basic" and counts[i] == 0:
                target = next(
                    (j for j, r in enumerate(mappings) if r["sku"] == m["mapped_sku"]),
                    -1,
                )
                if target >= 0 and counts[target] > 0:
                    counts[i] = m["mapped_sku_count"] * counts[target]
    return counts


def _parse_sku_mappings(row: dict, mapping_indices: list[int]) -> list[dict]:
    """Read sku_map_N_sku / sku_map_N_mapped_to / sku_map_N_qty columns from a CSV row."""
    raw: list[dict] = []
    for n in mapping_indices:
        sku_name  = (row.get(f"sku_map_{n}_sku")       or "").strip()
        mapped_to = (row.get(f"sku_map_{n}_mapped_to") or "").strip() or "basic"
        qty_raw   = (row.get(f"sku_map_{n}_qty")       or "").strip()
        if not sku_name:
            continue
        try:
            qty = max(1, int(float(qty_raw))) if qty_raw else 1
        except ValueError:
            qty = 1
        raw.append({"sku": sku_name, "mapped_sku": mapped_to, "mapped_sku_count": qty, "basic_sku_count": 0})
    counts = _compute_basic_counts(raw)
    return [{**m, "basic_sku_count": counts[i]} for i, m in enumerate(raw)]


# ─── Products ─────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[ProductResponse])
async def list_products(
    page:         int  = Query(default=1, ge=1),
    page_size:    int  = Query(default=20, ge=1, le=100),
    search:       str | None  = Query(default=None),
    category_id:  str | None  = Query(default=None),
    brand_id:     str | None  = Query(default=None),
    generic_id:   str | None  = Query(default=None),
    basic_sku_id: str | None  = Query(default=None),
    is_active:    bool | None = Query(default=None),
    sort_by:      str | None  = Query(default=None),
    sort_dir:     str | None  = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = _build_product_filter(search, category_id, brand_id, generic_id, basic_sku_id, is_active)

    total      = db[Collections.PRODUCTS].count_documents(filt)
    skip       = (page - 1) * page_size
    sort_field = sort_by if sort_by in PRODUCT_SORT_FIELDS else "name"
    sort_order = DESCENDING if sort_dir == "desc" else ASCENDING

    docs     = db[Collections.PRODUCTS].find(filt).sort(sort_field, sort_order).skip(skip).limit(page_size)
    products = [ProductResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[ProductResponse](
        data=products, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(payload: ProductCreate, current_user: dict = Depends(require_min_role("MANAGER"))):
    db     = get_db()
    if db[Collections.PRODUCTS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A product named '{payload.name}' already exists.")
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()

    generic_name   = _lookup_name(Collections.GENERICS,   payload.generic_id)
    brand_name     = _lookup_name(Collections.BRANDS,     payload.brand_id)
    category_name  = _lookup_name(Collections.CATEGORIES, payload.category_id)
    basic_sku_name = _lookup_name(Collections.SKUS,      payload.basic_sku_id)

    data = {
        "_id": doc_id, **payload.model_dump(),
        "generic_name": generic_name, "brand_name": brand_name,
        "category_name": category_name, "basic_sku_name": basic_sku_name,
        "created_at":            now,
        "created_by_id":         current_user["id"],
        "created_by_name":       current_user.get("full_name", ""),
        "last_modified_at":      now,
        "last_modified_by_id":   current_user["id"],
        "last_modified_by_name": current_user.get("full_name", ""),
    }
    db[Collections.PRODUCTS].insert_one(data)
    return ProductResponse(**doc_to_dict(data))


@router.get("/export")
async def export_products(
    search:       str | None  = Query(default=None),
    category_id:  str | None  = Query(default=None),
    brand_id:     str | None  = Query(default=None),
    generic_id:   str | None  = Query(default=None),
    basic_sku_id: str | None  = Query(default=None),
    is_active:    bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = _build_product_filter(search, category_id, brand_id, generic_id, basic_sku_id, is_active)
    docs = list(db[Collections.PRODUCTS].find(filt).sort("name", ASCENDING))

    max_mappings = max((len(d.get("sku_mappings") or []) for d in docs), default=0)
    max_mappings = max(max_mappings, 2)

    base_headers = [
        "name", "generic_name", "brand_name", "category_name", "basic_sku_name",
        "barcode", "specific_instructions", "is_active",
    ]
    mapping_headers = [
        col
        for n in range(1, max_mappings + 1)
        for col in (f"sku_map_{n}_sku", f"sku_map_{n}_mapped_to", f"sku_map_{n}_qty")
    ]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(base_headers + mapping_headers)
    for d in docs:
        mappings = d.get("sku_mappings") or []
        base_row = [
            d.get("name",                  ""),
            d.get("generic_name",          ""),
            d.get("brand_name",            ""),
            d.get("category_name",         ""),
            d.get("basic_sku_name",        ""),
            d.get("barcode")               or "",
            d.get("specific_instructions") or "",
            "TRUE" if d.get("is_active", True) else "FALSE",
        ]
        mapping_cells = []
        for n in range(max_mappings):
            if n < len(mappings):
                m = mappings[n]
                mapping_cells += [m.get("sku", ""), m.get("mapped_sku", "basic"), str(m.get("mapped_sku_count", 1))]
            else:
                mapping_cells += ["", "", ""]
        writer.writerow(base_row + mapping_cells)
    return _csv_response(output, "products_export.csv")


@router.get("/import/template")
async def products_import_template(current_user: dict = Depends(require_min_role("MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "name", "generic_name", "brand_name", "category_name", "basic_sku_name",
        "barcode", "specific_instructions", "is_active",
        "sku_map_1_sku", "sku_map_1_mapped_to", "sku_map_1_qty",
        "sku_map_2_sku", "sku_map_2_mapped_to", "sku_map_2_qty",
    ])
    writer.writerow([
        "Panadol 500mg Tablets", "Paracetamol", "Panadol", "Analgesics", "Tablet",
        "9780201379624", "Take with food", "TRUE",
        "Strip", "basic", "10",
        "Box", "Strip", "3",
    ])
    writer.writerow([
        "Augmentin 625mg Tablets", "Amoxicillin", "Augmentin", "Antibiotics", "Tablet",
        "", "Complete the full course", "TRUE",
        "Strip", "basic", "6",
        "", "", "",
    ])
    return _csv_response(output, "products_import_template.csv")


@router.post("/import")
async def import_products(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db     = get_db()
    reader = _decode_csv_upload(await file.read())
    required = {"name", "generic_name", "brand_name", "category_name", "basic_sku_name"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise HTTPException(status_code=400, detail=f"CSV must include columns: {', '.join(sorted(required))}")

    # Detect which sku_map_N_* slot indices are present in the CSV headers
    fieldnames      = set(reader.fieldnames or [])
    mapping_indices = sorted({
        int(m.group(1))
        for f in fieldnames
        if (m := re.match(r"^sku_map_(\d+)_sku$", f))
    })
    has_mapping_columns = bool(mapping_indices)

    created, updated, failed, errors = 0, 0, 0, []
    for row_num, row in enumerate(reader, start=2):
        name           = (row.get("name")           or "").strip()
        generic_name   = (row.get("generic_name")   or "").strip()
        brand_name     = (row.get("brand_name")     or "").strip()
        category_name  = (row.get("category_name")  or "").strip()
        basic_sku_name = (row.get("basic_sku_name") or "").strip()

        row_errors = []
        if not name:           row_errors.append("name is required")
        if not generic_name:   row_errors.append("generic_name is required")
        if not brand_name:     row_errors.append("brand_name is required")
        if not category_name:  row_errors.append("category_name is required")
        if not basic_sku_name: row_errors.append("basic_sku_name is required")
        if row_errors:
            errors.append({"row": row_num, "message": "; ".join(row_errors)}); failed += 1; continue

        generic_id   = _lookup_id_by_name(Collections.GENERICS,   generic_name)
        brand_id     = _lookup_id_by_name(Collections.BRANDS,     brand_name)
        category_id  = _lookup_id_by_name(Collections.CATEGORIES, category_name)
        basic_sku_id = _lookup_id_by_name(Collections.SKUS,      basic_sku_name)

        lookup_errors = []
        if not generic_id:   lookup_errors.append(f"generic '{generic_name}' not found")
        if not brand_id:     lookup_errors.append(f"brand '{brand_name}' not found")
        if not category_id:  lookup_errors.append(f"category '{category_name}' not found")
        if not basic_sku_id: lookup_errors.append(f"basic_sku '{basic_sku_name}' not found")
        if lookup_errors:
            errors.append({"row": row_num, "message": "; ".join(lookup_errors)}); failed += 1; continue

        barcode               = (row.get("barcode")               or "").strip() or None
        specific_instructions = (row.get("specific_instructions") or "").strip() or None
        is_active             = _parse_bool(row.get("is_active") or "TRUE", default=True)
        sku_mappings          = _parse_sku_mappings(row, mapping_indices) if has_mapping_columns else None
        now                   = datetime.now(timezone.utc).isoformat()
        existing              = db[Collections.PRODUCTS].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )

        if existing:
            update_data = {
                "name": name, "generic_id": generic_id, "generic_name": generic_name,
                "brand_id": brand_id, "brand_name": brand_name,
                "category_id": category_id, "category_name": category_name,
                "basic_sku_id": basic_sku_id, "basic_sku_name": basic_sku_name,
                "barcode": barcode, "specific_instructions": specific_instructions,
                "is_active": is_active, "last_modified_at": now,
            }
            if sku_mappings is not None:
                update_data["sku_mappings"] = sku_mappings
            db[Collections.PRODUCTS].update_one({"_id": existing["_id"]}, {"$set": update_data})
            updated += 1
        else:
            db[Collections.PRODUCTS].insert_one({
                "_id":                   new_id(),
                "name":                  name,
                "generic_id":            generic_id,
                "generic_name":          generic_name,
                "brand_id":              brand_id,
                "brand_name":            brand_name,
                "category_id":           category_id,
                "category_name":         category_name,
                "basic_sku_id":          basic_sku_id,
                "basic_sku_name":        basic_sku_name,
                "barcode":               barcode,
                "specific_instructions": specific_instructions,
                "sku_mappings":          sku_mappings if sku_mappings is not None else [],
                "is_active":             is_active,
                "created_at":            now,
                "last_modified_at":      now,
            })
            created += 1

    return {"created": created, "updated": updated, "failed": failed, "errors": errors}


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
    if "name" in updates:
        if db[Collections.PRODUCTS].find_one({
            "name": {"$regex": f"^{re.escape(updates['name'].strip())}$", "$options": "i"},
            "_id":  {"$ne": product_id},
        }):
            raise HTTPException(status_code=409, detail=f"A product named '{updates['name']}' already exists.")
    if "generic_id"   in updates: updates["generic_name"]   = _lookup_name(Collections.GENERICS,   updates["generic_id"])
    if "brand_id"     in updates: updates["brand_name"]     = _lookup_name(Collections.BRANDS,     updates["brand_id"])
    if "category_id"  in updates: updates["category_name"]  = _lookup_name(Collections.CATEGORIES, updates["category_id"])
    if "basic_sku_id" in updates: updates["basic_sku_name"] = _lookup_name(Collections.SKUS,      updates["basic_sku_id"])
    updates["last_modified_at"]      = datetime.now(timezone.utc).isoformat()
    updates["last_modified_by_id"]   = current_user["id"]
    updates["last_modified_by_name"] = current_user.get("full_name", "")
    db[Collections.PRODUCTS].update_one({"_id": product_id}, {"$set": updates})
    return ProductResponse(**doc_to_dict(db[Collections.PRODUCTS].find_one({"_id": product_id})))


# ─── Private helpers ──────────────────────────────────────────────────────────

def _build_product_filter(
    search:       str | None,
    category_id:  str | None,
    brand_id:     str | None,
    generic_id:   str | None,
    basic_sku_id: str | None,
    is_active:    bool | None,
) -> dict:
    filt: dict = {}
    if category_id:           filt["category_id"]  = category_id
    if brand_id:              filt["brand_id"]      = brand_id
    if generic_id:            filt["generic_id"]    = generic_id
    if basic_sku_id:          filt["basic_sku_id"]  = basic_sku_id
    if is_active is not None: filt["is_active"]     = is_active
    if search:
        filt.update(build_search_filter(search, ["name", "barcode", "generic_name", "brand_name", "category_name"]))
    return filt
