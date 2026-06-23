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
from app.utils.audit import audit_create_fields, audit_update_fields

router = APIRouter(prefix="/products", tags=["Products"])

PRODUCT_SORT_FIELDS = {"name", "brand_name", "category_name", "generic_name", "created_at", "updated_at"}


# â"€â"€â"€ Internal helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

def _simple_list(collection: str, response_model):
    db   = get_db()
    docs = db[collection].find().sort("name", ASCENDING)
    return [response_model(**doc_to_dict(d)) for d in docs]


def _simple_create(collection: str, payload, response_model, current_user: dict):
    db     = get_db()
    doc_id = new_id()
    now    = datetime.now(timezone.utc).isoformat()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now, "updated_at": now, **audit_create_fields(current_user)}
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


# â"€â"€â"€ Sub-catalog: Generics â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

def _resolve_generic_response(db, doc):
    d = doc_to_dict(doc) if "_id" in doc else dict(doc)
    loc_id = d.get("stock_location_id")
    if loc_id:
        d["stock_location_name"] = _lookup_name(Collections.STOCK_LOCATIONS, loc_id)
    else:
        d["stock_location_name"] = None
    return ProductGenericResponse(**d)


@router.get("/generics", response_model=list[ProductGenericResponse])
async def list_generics(
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    filt = {} if is_active is None else {"is_active": is_active}
    docs = db[Collections.GENERICS].find(filt).sort("name", ASCENDING)
    return [_resolve_generic_response(db, d) for d in docs]

@router.post("/generics", response_model=ProductGenericResponse, status_code=201)
async def create_generic(payload: ProductGenericCreate, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db = get_db()
    if db[Collections.GENERICS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A generic named '{payload.name}' already exists.")
    doc_id = new_id()
    now    = datetime.now(timezone.utc).isoformat()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now, "updated_at": now, **audit_create_fields(current_user)}
    db[Collections.GENERICS].insert_one(data)
    return _resolve_generic_response(db, data)

@router.get("/generics/export")
async def export_generics(current_user: dict = Depends(get_current_user)):
    db     = get_db()
    docs   = db[Collections.GENERICS].find().sort("name", ASCENDING)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "description", "dosage_form", "requires_prescription",
                     "controlled_substance_schedule", "active_ingredients",
                     "side_effects", "local_license_number", "is_active"])
    for d in docs:
        writer.writerow([
            d.get("name", ""),
            d.get("description") or "",
            d.get("dosage_form") or "",
            str(d.get("requires_prescription", False)).upper(),
            d.get("controlled_substance_schedule") or "",
            d.get("active_ingredients") or "",
            "|".join(d.get("side_effects") or []),
            d.get("local_license_number") or "",
            str(d.get("is_active", True)).upper(),
        ])
    return _csv_response(output, "generics_export.csv")

@router.get("/generics/import/template")
async def generics_import_template(current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "description", "dosage_form", "requires_prescription"])
    writer.writerow(["Paracetamol",  "Common analgesic and antipyretic", "TABLET", "FALSE"])
    writer.writerow(["Amoxicillin",  "Broad-spectrum antibiotic",        "CAPSULE", "TRUE"])
    writer.writerow(["Metformin",    "Biguanide antidiabetic",           "TABLET", "TRUE"])
    return _csv_response(output, "generics_import_template.csv")

@router.post("/generics/import")
async def import_generics(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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
        description   = (row.get("description") or "").strip() or None
        dosage_form   = (row.get("dosage_form") or "").strip().upper() or None
        requires_rx   = _parse_bool(row.get("requires_prescription") or "FALSE", default=False)
        now = datetime.now(timezone.utc).isoformat()
        existing = db[Collections.GENERICS].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        if existing:
            update_set: dict = {"name": name, "description": description, "updated_at": now, **audit_update_fields(current_user)}
            if dosage_form:
                update_set["dosage_form"] = dosage_form
            update_set["requires_prescription"] = requires_rx
            db[Collections.GENERICS].update_one({"_id": existing["_id"]}, {"$set": update_set})
            updated += 1
        else:
            db[Collections.GENERICS].insert_one({
                "_id": new_id(), "name": name, "description": description,
                "dosage_form": dosage_form, "requires_prescription": requires_rx,
                "controlled_substance_schedule": "NONE",
                "side_effects": [], "storage_conditions": [],
                "special_instructions": [], "dosage_instructions": [],
                "is_active": True, "created_at": now, "updated_at": now,
                **audit_create_fields(current_user),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}

@router.get("/generics/{generic_id}", response_model=ProductGenericResponse)
async def get_generic(generic_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.GENERICS].find_one({"_id": generic_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Generic not found")
    return _resolve_generic_response(db, doc)

@router.patch("/generics/{generic_id}", response_model=ProductGenericResponse)
async def update_generic(
    generic_id: str, payload: ProductGenericUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    generic_doc = db[Collections.GENERICS].find_one({"_id": generic_id})
    if not generic_doc:
        raise HTTPException(status_code=404, detail="Generic not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}

    if "is_active" in updates and updates["is_active"] is False and generic_doc.get("is_active", True):
        product_count = db[Collections.PRODUCTS].count_documents({"generic_id": generic_id, "is_active": True})
        if product_count > 0:
            raise HTTPException(status_code=400, detail=f"Cannot deactivate: {product_count} active product(s) reference this generic")

    if "name" in updates:
        duplicate = db[Collections.GENERICS].find_one({
            "name": {"$regex": f"^{re.escape(updates['name'].strip())}$", "$options": "i"},
            "_id":  {"$ne": generic_id},
        })
        if duplicate:
            raise HTTPException(status_code=409, detail=f"A generic named '{updates['name']}' already exists.")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.GENERICS].update_one({"_id": generic_id}, {"$set": updates})
    return _resolve_generic_response(db, db[Collections.GENERICS].find_one({"_id": generic_id}))


# â"€â"€â"€ Sub-catalog: Brands â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
async def create_brand(payload: ProductBrandCreate, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db = get_db()
    if db[Collections.BRANDS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A brand named '{payload.name}' already exists.")
    return _simple_create(Collections.BRANDS, payload, ProductBrandResponse, current_user)

@router.get("/brands/export")
async def export_brands(current_user: dict = Depends(get_current_user)):
    db     = get_db()
    docs   = db[Collections.BRANDS].find().sort("name", ASCENDING)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "manufacturer_name", "country", "return_expiry_before", "is_active"])
    for d in docs:
        writer.writerow([
            d.get("name", ""),
            d.get("manufacturer_name") or "",
            d.get("country") or "",
            d.get("return_expiry_before") or "",
            str(d.get("is_active", True)).upper(),
        ])
    return _csv_response(output, "brands_export.csv")

@router.get("/brands/import/template")
async def brands_import_template(current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "manufacturer_name", "country", "return_expiry_before"])
    writer.writerow(["Panadol",   "Haleon plc",          "UK",         "60"])
    writer.writerow(["Augmentin", "GlaxoSmithKline",     "UK",         "90"])
    writer.writerow(["Brufen",    "Abbott Laboratories",  "USA",        "30"])
    return _csv_response(output, "brands_import_template.csv")

@router.post("/brands/import")
async def import_brands(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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
        manufacturer_name    = (row.get("manufacturer_name")    or "").strip() or None
        country              = (row.get("country")              or "").strip() or None
        return_expiry_raw    = (row.get("return_expiry_before") or "").strip()
        return_expiry_before = int(return_expiry_raw) if return_expiry_raw.isdigit() else None
        existing = db[Collections.BRANDS].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        now = datetime.now(timezone.utc).isoformat()
        if existing:
            db[Collections.BRANDS].update_one(
                {"_id": existing["_id"]},
                {"$set": {"name": name, "manufacturer_name": manufacturer_name,
                           "country": country, "return_expiry_before": return_expiry_before,
                           "updated_at": now, **audit_update_fields(current_user)}},
            )
            updated += 1
        else:
            db[Collections.BRANDS].insert_one({
                "_id": new_id(), "name": name, "manufacturer_name": manufacturer_name,
                "country": country, "return_expiry_before": return_expiry_before,
                "is_active": True, "created_at": now, "updated_at": now,
                **audit_create_fields(current_user),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}

@router.patch("/brands/{brand_id}", response_model=ProductBrandResponse)
async def update_brand(
    brand_id: str, payload: ProductBrandUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    brand_doc = db[Collections.BRANDS].find_one({"_id": brand_id})
    if not brand_doc:
        raise HTTPException(status_code=404, detail="Brand not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}

    if "is_active" in updates and updates["is_active"] is False and brand_doc.get("is_active", True):
        product_count = db[Collections.PRODUCTS].count_documents({"brand_id": brand_id, "is_active": True})
        if product_count > 0:
            raise HTTPException(status_code=400, detail=f"Cannot deactivate: {product_count} active product(s) reference this brand")

    if "name" in updates:
        duplicate = db[Collections.BRANDS].find_one({
            "name": {"$regex": f"^{re.escape(updates['name'].strip())}$", "$options": "i"},
            "_id":  {"$ne": brand_id},
        })
        if duplicate:
            raise HTTPException(status_code=409, detail=f"A brand named '{updates['name']}' already exists.")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.BRANDS].update_one({"_id": brand_id}, {"$set": updates})
    return ProductBrandResponse(**doc_to_dict(db[Collections.BRANDS].find_one({"_id": brand_id})))


# â"€â"€â"€ Sub-catalog: Categories â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

def _resolve_categories(db, filt: dict | None = None) -> list[ProductCategoryResponse]:
    all_docs    = list(db[Collections.CATEGORIES].find().sort("name", ASCENDING))
    id_to_doc   = {str(d["_id"]): d for d in all_docs}
    id_to_name  = {str(d["_id"]): d["name"] for d in all_docs}

    def _compute_level_path(doc_id: str) -> tuple[int, str]:
        parts, current = [], doc_id
        while True:
            doc = id_to_doc.get(current)
            if not doc or not doc.get("parent_id"):
                break
            parent_id = doc["parent_id"]
            parent = id_to_doc.get(parent_id)
            if parent:
                parts.append(parent["name"])
            current = parent_id
        parts.reverse()
        return len(parts), " > ".join(parts) if parts else ""

    def _compute_effective_margin(doc_id: str) -> float | None:
        visited, current = set(), doc_id
        while current and current not in visited:
            visited.add(current)
            doc = id_to_doc.get(current)
            if not doc:
                break
            margin = doc.get("default_margin_percentage")
            if margin is not None:
                return margin
            current = doc.get("parent_id")
        return None

    filtered_ids = {str(d["_id"]) for d in db[Collections.CATEGORIES].find(filt or {}, {"_id": 1})} if filt else None
    result = []
    for d in all_docs:
        did = str(d["_id"])
        if filtered_ids is not None and did not in filtered_ids:
            continue
        cat = doc_to_dict(d)
        cat["parent_name"] = id_to_name.get(cat.get("parent_id") or "") or None
        level, path = _compute_level_path(did)
        cat["level"] = level
        cat["path"]  = path
        cat["effective_margin_percentage"] = _compute_effective_margin(did)
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
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now, "updated_at": now, **audit_create_fields(current_user)}
    db[Collections.CATEGORIES].insert_one(data)
    resolved = _resolve_categories(db, {"_id": doc_id})
    return resolved[0]


@router.get("/categories/export")
async def export_categories(current_user: dict = Depends(get_current_user)):
    db     = get_db()
    docs   = db[Collections.CATEGORIES].find().sort("name", ASCENDING)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "parent_name", "is_discount_applicable", "default_margin_percentage", "is_active"])
    id_to_name = {str(d["_id"]): d["name"] for d in db[Collections.CATEGORIES].find({}, {"name": 1})}
    for d in docs:
        margin = d.get("default_margin_percentage")
        writer.writerow([
            d.get("name", ""),
            id_to_name.get(d.get("parent_id") or "") or "",
            str(d.get("is_discount_applicable", False)).upper(),
            str(margin) if margin is not None else "",
            str(d.get("is_active", True)).upper(),
        ])
    return _csv_response(output, "categories_export.csv")


@router.get("/categories/import/template")
async def categories_import_template(current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "parent_name", "is_discount_applicable", "default_margin_percentage", "is_active"])
    writer.writerow(["Analgesics",      "",            "TRUE",  "15", "TRUE"])
    writer.writerow(["Antibiotics",     "",            "TRUE",  "20", "TRUE"])
    writer.writerow(["IV Antibiotics",  "Antibiotics", "FALSE", "",   "TRUE"])
    writer.writerow(["Antidiabetics",   "",            "TRUE",  "",   "FALSE"])
    return _csv_response(output, "categories_import_template.csv")


@router.post("/categories/import")
async def import_categories(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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
        is_discount_applicable = _parse_bool(row.get("is_discount_applicable") or "FALSE", default=False)
        is_active   = _parse_bool(row.get("is_active") or "TRUE", default=True)

        raw_margin = (row.get("default_margin_percentage") or "").strip()
        default_margin_percentage = None
        if raw_margin:
            try:
                default_margin_percentage = float(raw_margin)
            except ValueError:
                errors.append({"row": row_num, "message": f"invalid margin value '{raw_margin}'"}); failed += 1; continue

        parent_name = (row.get("parent_name") or "").strip() or None
        parent_id   = None
        if parent_name:
            parent_id = _lookup_id_by_name(Collections.CATEGORIES, parent_name)
            if not parent_id:
                errors.append({"row": row_num, "message": f"parent category '{parent_name}' not found"}); failed += 1; continue

        existing = db[Collections.CATEGORIES].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        now = datetime.now(timezone.utc).isoformat()
        if existing:
            db[Collections.CATEGORIES].update_one(
                {"_id": existing["_id"]},
                {"$set": {"name": name, "parent_id": parent_id,
                           "is_discount_applicable": is_discount_applicable,
                           "default_margin_percentage": default_margin_percentage,
                           "is_active": is_active, "updated_at": now,
                           **audit_update_fields(current_user)}},
            )
            updated += 1
        else:
            db[Collections.CATEGORIES].insert_one({
                "_id": new_id(), "name": name, "parent_id": parent_id,
                "is_discount_applicable": is_discount_applicable,
                "default_margin_percentage": default_margin_percentage,
                "is_active": is_active, "created_at": now, "updated_at": now,
                **audit_create_fields(current_user),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}


@router.patch("/categories/{category_id}", response_model=ProductCategoryResponse)
async def update_category(
    category_id:  str,
    payload:      ProductCategoryUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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

    if "is_active" in updates and updates["is_active"] is False:
        existing_doc = db[Collections.CATEGORIES].find_one({"_id": category_id})
        if existing_doc and existing_doc.get("is_active", True):
            child_count = db[Collections.CATEGORIES].count_documents({"parent_id": category_id, "is_active": True})
            if child_count > 0:
                raise HTTPException(status_code=400, detail=f"Cannot deactivate: {child_count} active child categor{'y' if child_count == 1 else 'ies'} exist")
            product_count = db[Collections.PRODUCTS].count_documents({"category_id": category_id, "is_active": True})
            if product_count > 0:
                raise HTTPException(status_code=400, detail=f"Cannot deactivate: {product_count} active product(s) reference this category")

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
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        updates.update(audit_update_fields(current_user))
        db[Collections.CATEGORIES].update_one({"_id": category_id}, {"$set": updates})

    resolved = _resolve_categories(db, {"_id": category_id})
    return resolved[0]


# â"€â"€â"€ Sub-catalog: SKUs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
async def create_sku(payload: ProductSkuCreate, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db = get_db()
    if db[Collections.SKUS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A SKU named '{payload.name}' already exists.")
    return _simple_create(Collections.SKUS, payload, ProductSkuResponse, current_user)

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
async def skus_import_template(current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
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
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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
                           "updated_at": datetime.now(timezone.utc).isoformat(),
                           **audit_update_fields(current_user)}},
            )
            updated += 1
        else:
            db[Collections.SKUS].insert_one({
                "_id": new_id(), "name": name, "plural": plural,
                "sku_type": sku_type, "is_active": is_active,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                **audit_create_fields(current_user),
            })
            created += 1
    return {"created": created, "updated": updated, "failed": failed, "errors": errors}

@router.patch("/skus/{sku_id}", response_model=ProductSkuResponse)
async def update_sku(
    sku_id: str, payload: ProductSkuUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    sku_doc = db[Collections.SKUS].find_one({"_id": sku_id})
    if not sku_doc:
        raise HTTPException(status_code=404, detail="SKU not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}

    if "is_active" in updates and updates["is_active"] is False and sku_doc.get("is_active", True):
        product_count = db[Collections.PRODUCTS].count_documents({"basic_sku_id": sku_id, "is_active": True})
        mapping_count = db[Collections.PRODUCTS].count_documents({"sku_mappings.sku": sku_doc["name"], "is_active": True})
        total_refs = product_count + mapping_count
        if total_refs > 0:
            raise HTTPException(status_code=400, detail=f"Cannot deactivate: {total_refs} active product(s) reference this SKU")

    if "name" in updates:
        if db[Collections.SKUS].find_one({
            "name": {"$regex": f"^{re.escape(updates['name'].strip())}$", "$options": "i"},
            "_id":  {"$ne": sku_id},
        }):
            raise HTTPException(status_code=409, detail=f"A SKU named '{updates['name']}' already exists.")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.SKUS].update_one({"_id": sku_id}, {"$set": updates})
    return ProductSkuResponse(**doc_to_dict(db[Collections.SKUS].find_one({"_id": sku_id})))


# â"€â"€â"€ SKU mapping helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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


# â"€â"€â"€ Products â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

def _product_lookup_pipeline():
    return [
        {"$lookup": {"from": Collections.GENERICS,   "localField": "generic_id",   "foreignField": "_id", "as": "_generic"}},
        {"$lookup": {"from": Collections.BRANDS,     "localField": "brand_id",     "foreignField": "_id", "as": "_brand"}},
        {"$lookup": {"from": Collections.CATEGORIES, "localField": "category_id",  "foreignField": "_id", "as": "_category"}},
        {"$lookup": {"from": Collections.SKUS,       "localField": "basic_sku_id", "foreignField": "_id", "as": "_sku"}},
        {"$addFields": {
            "generic_name":   {"$ifNull": [{"$arrayElemAt": ["$_generic.name", 0]}, ""]},
            "brand_name":     {"$ifNull": [{"$arrayElemAt": ["$_brand.name", 0]}, ""]},
            "category_name":  {"$ifNull": [{"$arrayElemAt": ["$_category.name", 0]}, ""]},
            "basic_sku_name": {"$ifNull": [{"$arrayElemAt": ["$_sku.name", 0]}, ""]},
        }},
        {"$project": {"_generic": 0, "_brand": 0, "_category": 0, "_sku": 0}},
    ]


@router.get("", response_model=PaginatedResponse[ProductResponse])
async def list_products(
    page:         int  = Query(default=1, ge=1),
    page_size:    int  = Query(default=20, ge=1, le=500),
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
    db = get_db()
    base_filt = _build_product_filter(None, category_id, brand_id, generic_id, basic_sku_id, is_active)

    sort_field = sort_by if sort_by in PRODUCT_SORT_FIELDS else "name"
    sort_order = DESCENDING if sort_dir == "desc" else ASCENDING
    skip_val   = (page - 1) * page_size

    pipeline = [{"$match": base_filt}] + _product_lookup_pipeline()

    if search:
        pattern = {"$regex": search, "$options": "i"}
        pipeline.append({"$match": {"$or": [
            {"name": pattern}, {"barcode": pattern},
            {"generic_name": pattern}, {"brand_name": pattern}, {"category_name": pattern},
        ]}})

    count_pipeline = pipeline + [{"$count": "total"}]
    count_result   = list(db[Collections.PRODUCTS].aggregate(count_pipeline))
    total          = count_result[0]["total"] if count_result else 0

    pipeline += [{"$sort": {sort_field: sort_order}}, {"$skip": skip_val}, {"$limit": page_size}]
    docs     = list(db[Collections.PRODUCTS].aggregate(pipeline))
    products = [ProductResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[ProductResponse](
        data=products, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(payload: ProductCreate, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    db = get_db()
    if db[Collections.PRODUCTS].find_one({"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail=f"A product named '{payload.name}' already exists.")
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()

    data = {
        "_id": doc_id, **payload.model_dump(),
        "created_at": now, "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.PRODUCTS].insert_one(data)

    doc = doc_to_dict(data)
    doc["generic_name"]   = _lookup_name(Collections.GENERICS,   payload.generic_id) if payload.generic_id else ""
    doc["brand_name"]     = _lookup_name(Collections.BRANDS,     payload.brand_id) if payload.brand_id else ""
    doc["category_name"]  = _lookup_name(Collections.CATEGORIES, payload.category_id)
    doc["basic_sku_name"] = _lookup_name(Collections.SKUS,       payload.basic_sku_id)
    return ProductResponse(**doc)


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
    base_filt = _build_product_filter(None, category_id, brand_id, generic_id, basic_sku_id, is_active)
    pipeline  = [{"$match": base_filt}] + _product_lookup_pipeline() + [{"$sort": {"name": ASCENDING}}]
    if search:
        pattern = {"$regex": search, "$options": "i"}
        pipeline.insert(len(pipeline) - 1, {"$match": {"$or": [
            {"name": pattern}, {"barcode": pattern},
            {"generic_name": pattern}, {"brand_name": pattern}, {"category_name": pattern},
        ]}})
    docs = list(db[Collections.PRODUCTS].aggregate(pipeline))

    max_mappings = max((len(d.get("sku_mappings") or []) for d in docs), default=0)
    max_mappings = max(max_mappings, 2)

    base_headers = [
        "name", "generic_name", "brand_name", "category_name", "basic_sku_name",
        "barcode", "description", "specific_instructions", "is_discount_applicable",
        "reorder_level", "is_active",
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
            d.get("description")           or "",
            d.get("specific_instructions") or "",
            "TRUE" if d.get("is_discount_applicable", False) else "FALSE",
            str(d.get("reorder_level", 0)),
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
async def products_import_template(current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "name", "generic_name", "brand_name", "category_name", "basic_sku_name",
        "barcode", "description", "specific_instructions", "is_discount_applicable",
        "reorder_level", "is_active",
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
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db     = get_db()
    reader = _decode_csv_upload(await file.read())
    required = {"name", "category_name", "basic_sku_name"}
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
        if not category_name:  row_errors.append("category_name is required")
        if not basic_sku_name: row_errors.append("basic_sku_name is required")
        if row_errors:
            errors.append({"row": row_num, "message": "; ".join(row_errors)}); failed += 1; continue

        generic_id   = _lookup_id_by_name(Collections.GENERICS,   generic_name) if generic_name else None
        brand_id     = _lookup_id_by_name(Collections.BRANDS,     brand_name) if brand_name else None
        category_id  = _lookup_id_by_name(Collections.CATEGORIES, category_name)
        basic_sku_id = _lookup_id_by_name(Collections.SKUS,       basic_sku_name)

        lookup_errors = []
        if generic_name and not generic_id: lookup_errors.append(f"generic '{generic_name}' not found")
        if brand_name   and not brand_id:   lookup_errors.append(f"brand '{brand_name}' not found")
        if not category_id:                 lookup_errors.append(f"category '{category_name}' not found")
        if not basic_sku_id:                lookup_errors.append(f"basic_sku '{basic_sku_name}' not found")
        if lookup_errors:
            errors.append({"row": row_num, "message": "; ".join(lookup_errors)}); failed += 1; continue

        barcode                = (row.get("barcode")               or "").strip() or None
        description            = (row.get("description")           or "").strip() or None
        specific_instructions  = (row.get("specific_instructions") or "").strip() or None
        is_discount_applicable = _parse_bool(row.get("is_discount_applicable") or "FALSE", default=False)
        reorder_raw            = (row.get("reorder_level") or "").strip()
        reorder_level          = int(reorder_raw) if reorder_raw.isdigit() else 0
        is_active              = _parse_bool(row.get("is_active") or "TRUE", default=True)
        sku_mappings           = _parse_sku_mappings(row, mapping_indices) if has_mapping_columns else None
        now                    = datetime.now(timezone.utc).isoformat()
        existing               = db[Collections.PRODUCTS].find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )

        if existing:
            update_data = {
                "name": name, "generic_id": generic_id, "brand_id": brand_id,
                "category_id": category_id, "basic_sku_id": basic_sku_id,
                "barcode": barcode, "description": description,
                "specific_instructions": specific_instructions,
                "is_discount_applicable": is_discount_applicable,
                "reorder_level": reorder_level,
                "is_active": is_active, "updated_at": now,
                **audit_update_fields(current_user),
            }
            if sku_mappings is not None:
                update_data["sku_mappings"] = sku_mappings
            db[Collections.PRODUCTS].update_one({"_id": existing["_id"]}, {"$set": update_data})
            updated += 1
        else:
            db[Collections.PRODUCTS].insert_one({
                "_id":                    new_id(),
                "name":                   name,
                "generic_id":             generic_id,
                "brand_id":               brand_id,
                "category_id":            category_id,
                "basic_sku_id":           basic_sku_id,
                "barcode":                barcode,
                "description":            description,
                "specific_instructions":  specific_instructions,
                "is_discount_applicable": is_discount_applicable,
                "reorder_level":          reorder_level,
                "sku_mappings":           sku_mappings if sku_mappings is not None else [],
                "is_active":              is_active,
                "created_at":             now,
                "updated_at":             now,
                **audit_create_fields(current_user),
            })
            created += 1

    return {"created": created, "updated": updated, "failed": failed, "errors": errors}


def _resolve_product_names(db, doc: dict) -> dict:
    d = doc_to_dict(doc) if "_id" in doc else dict(doc)
    d["generic_name"]   = _lookup_name(Collections.GENERICS,   d.get("generic_id"))   if d.get("generic_id") else ""
    d["brand_name"]     = _lookup_name(Collections.BRANDS,     d.get("brand_id"))     if d.get("brand_id") else ""
    d["category_name"]  = _lookup_name(Collections.CATEGORIES, d.get("category_id"))  if d.get("category_id") else ""
    d["basic_sku_name"] = _lookup_name(Collections.SKUS,       d.get("basic_sku_id")) if d.get("basic_sku_id") else ""
    return d


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.PRODUCTS].find_one({"_id": product_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductResponse(**_resolve_product_names(db, doc))


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, payload: ProductUpdate, current_user: dict = Depends(require_min_role("BRANCH_MANAGER"))):
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
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.PRODUCTS].update_one({"_id": product_id}, {"$set": updates})
    return ProductResponse(**_resolve_product_names(db, db[Collections.PRODUCTS].find_one({"_id": product_id})))


# â"€â"€â"€ Private helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
        filt.update(build_search_filter(search, ["name", "barcode"]))
    return filt


