import csv
import io
import re
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from pymongo import ASCENDING
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.branch_scope import apply_branch_filter, ensure_branch_access, enforce_branch_on_create
from app.models.stock_location import StockLocationCreate, StockLocationUpdate, StockLocationResponse

router = APIRouter(prefix="/stock-locations", tags=["Stock Locations"])

SORT_FIELDS = {"name", "code", "created_at"}


@router.get("", response_model=list[StockLocationResponse])
async def list_stock_locations(
    branch_id: str | None  = Query(default=None),
    is_active: bool | None = Query(default=None),
    search:    str | None  = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    apply_branch_filter(flt, current_user, branch_id)

    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["name", "code"]))

    docs = db[Collections.STOCK_LOCATIONS].find(flt).sort("name", ASCENDING)
    return [StockLocationResponse(**doc_to_dict(d)) for d in docs]


@router.post("", response_model=StockLocationResponse, status_code=201)
async def create_stock_location(
    payload:      StockLocationCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    resolved_branch_id = enforce_branch_on_create(payload.branch_id, current_user)

    existing = db[Collections.STOCK_LOCATIONS].find_one({
        "branch_id": resolved_branch_id,
        "code": {"$regex": f"^{re.escape(payload.code)}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"A stock location with code '{payload.code}' already exists in this branch")

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id": doc_id,
        **payload.model_dump(),
        "branch_id":  resolved_branch_id,
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.STOCK_LOCATIONS].insert_one(data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="stock_location", resource_id=doc_id,
        branch_id=resolved_branch_id,
    )
    return StockLocationResponse(**doc_to_dict(data))


@router.patch("/{location_id}", response_model=StockLocationResponse)
async def update_stock_location(
    location_id:  str,
    payload:      StockLocationUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.STOCK_LOCATIONS].find_one({"_id": location_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Stock location not found")
    ensure_branch_access(doc, current_user)

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}

    if updates.get("code"):
        existing = db[Collections.STOCK_LOCATIONS].find_one({
            "branch_id": doc["branch_id"],
            "code": {"$regex": f"^{re.escape(updates['code'])}$", "$options": "i"},
            "_id": {"$ne": location_id},
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"A stock location with code '{updates['code']}' already exists in this branch")

    if "is_active" in updates and updates["is_active"] is False and doc.get("is_active", True):
        ref_count = db[Collections.GENERICS].count_documents({
            "stock_location_id": location_id,
            "is_active": True,
        })
        if ref_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot deactivate: {ref_count} active generic(s) reference this stock location",
            )

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.STOCK_LOCATIONS].update_one({"_id": location_id}, {"$set": updates})

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="stock_location", resource_id=location_id,
        branch_id=doc["branch_id"],
    )
    updated_doc = db[Collections.STOCK_LOCATIONS].find_one({"_id": location_id})
    return StockLocationResponse(**doc_to_dict(updated_doc))


@router.get("/export")
async def export_stock_locations(
    branch_id: str | None  = Query(default=None),
    is_active: bool | None = Query(default=None),
    search:    str | None  = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    apply_branch_filter(flt, current_user, branch_id)

    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["name", "code"]))

    docs = db[Collections.STOCK_LOCATIONS].find(flt).sort("name", ASCENDING)
    items = [doc_to_dict(d) for d in docs]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "code", "description", "is_active"])
    for item in items:
        writer.writerow([
            item.get("name", ""),
            item.get("code", ""),
            item.get("description", ""),
            str(item.get("is_active", True)).upper(),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=stock_locations_export.csv"},
    )


@router.get("/import/template")
async def stock_locations_import_template(
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "code", "description", "is_active"])
    writer.writerow(["Shelf A", "SH-A", "Main shelf near counter", "TRUE"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=stock_locations_import_template.csv"},
    )


@router.post("/import")
async def import_stock_locations(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    required_columns = {"name", "code"}
    if not required_columns.issubset(set(reader.fieldnames or [])):
        raise HTTPException(status_code=400, detail=f"CSV must include columns: {', '.join(sorted(required_columns))}")

    branch_id = enforce_branch_on_create(None, current_user)

    created, updated, failed = 0, 0, 0
    errors: list[dict] = []

    for row_num, row in enumerate(reader, start=2):
        name        = (row.get("name")        or "").strip()
        code        = (row.get("code")        or "").strip()
        description = (row.get("description") or "").strip() or None
        is_active_s = (row.get("is_active")   or "TRUE").strip().upper()

        if not name:
            errors.append({"row": row_num, "message": "name is required"})
            failed += 1
            continue
        if not code:
            errors.append({"row": row_num, "message": "code is required"})
            failed += 1
            continue

        is_active = is_active_s not in ("FALSE", "0", "NO", "INACTIVE")
        now = datetime.now(timezone.utc).isoformat()

        existing = db[Collections.STOCK_LOCATIONS].find_one({
            "branch_id": branch_id,
            "code": {"$regex": f"^{re.escape(code)}$", "$options": "i"},
        })

        if existing:
            db[Collections.STOCK_LOCATIONS].update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "name": name, "code": code, "description": description,
                    "is_active": is_active, "updated_at": now,
                    **audit_update_fields(current_user),
                }},
            )
            updated += 1
        else:
            db[Collections.STOCK_LOCATIONS].insert_one({
                "_id":         new_id(),
                "branch_id":   branch_id,
                "name":        name,
                "code":        code,
                "description": description,
                "is_active":   is_active,
                "created_at":  now,
                "updated_at":  now,
                **audit_create_fields(current_user),
            })
            created += 1

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="IMPORT",
        resource="stock_location", resource_id="bulk",
        branch_id=branch_id,
        details={"created": created, "updated": updated, "failed": failed},
    )

    return {"created": created, "updated": updated, "failed": failed, "errors": errors}
