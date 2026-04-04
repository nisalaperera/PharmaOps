import csv
import io
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.branch import BranchCreate, BranchUpdate, BranchResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/branches", tags=["Branches"])


BRANCH_SORT_FIELDS = {"name", "created_at"}

@router.get("", response_model=PaginatedResponse[BranchResponse])
async def list_branches(
    page:      int  = Query(default=1, ge=1),
    page_size: int  = Query(default=20, ge=1, le=100),
    search:    str | None  = Query(default=None),
    is_active: bool | None = Query(default=None),
    sort_by:   str | None  = Query(default="name"),
    sort_dir:  str | None  = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    if is_active is not None:
        filter["is_active"] = is_active
    if search:
        filter.update(build_search_filter(search, ["name", "address"]))

    sort_field     = sort_by if sort_by in BRANCH_SORT_FIELDS else "name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total    = db[Collections.BRANCHES].count_documents(filter)
    skip     = (page - 1) * page_size
    docs     = db[Collections.BRANCHES].find(filter).sort(sort_field, sort_direction).skip(skip).limit(page_size)
    branches = [BranchResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[BranchResponse](
        data=branches, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
async def create_branch(
    payload:      BranchCreate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()
    branch_id = new_id()

    branch_data = {
        "_id": branch_id,
        **payload.model_dump(),
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.BRANCHES].insert_one(branch_data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="branch", resource_id=branch_id,
    )
    return BranchResponse(**doc_to_dict(branch_data))


@router.get("/export")
async def export_branches(
    search:    str | None  = Query(default=None),
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    if is_active is not None:
        filter["is_active"] = is_active
    if search:
        filter.update(build_search_filter(search, ["name", "address"]))

    docs     = db[Collections.BRANCHES].find(filter).sort("name", 1)
    branches = [doc_to_dict(d) for d in docs]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "address", "phone", "license_number", "is_active", "created_at"])
    for b in branches:
        writer.writerow([
            b.get("name", ""),
            b.get("address", ""),
            b.get("phone", ""),
            b.get("license_number", ""),
            str(b.get("is_active", True)).upper(),
            b.get("created_at") or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=branches_export.csv"},
    )


@router.get("/import/template")
async def branches_import_template(
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "address", "phone", "license_number", "is_active"])
    writer.writerow(["Main Branch", "123 Pharmacy Street, Colombo", "011 234 5678", "PH-2024-001", "TRUE"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=branches_import_template.csv"},
    )


@router.post("/import")
async def import_branches(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()

    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader           = csv.DictReader(io.StringIO(text))
    required_columns = {"name", "address", "phone", "license_number"}
    if not required_columns.issubset(set(reader.fieldnames or [])):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must include columns: {', '.join(sorted(required_columns))}",
        )

    created: int       = 0
    failed:  int       = 0
    errors:  list[dict] = []

    for row_num, row in enumerate(reader, start=2):
        name           = (row.get("name")           or "").strip()
        address        = (row.get("address")        or "").strip()
        phone          = (row.get("phone")          or "").strip()
        license_number = (row.get("license_number") or "").strip()
        is_active_str  = (row.get("is_active")      or "TRUE").strip().upper()

        if not name:
            errors.append({"row": row_num, "message": "name is required"})
            failed += 1
            continue
        if not address:
            errors.append({"row": row_num, "message": "address is required"})
            failed += 1
            continue
        if not phone:
            errors.append({"row": row_num, "message": "phone is required"})
            failed += 1
            continue
        if not license_number:
            errors.append({"row": row_num, "message": "license_number is required"})
            failed += 1
            continue

        is_active = is_active_str not in ("FALSE", "0", "NO", "INACTIVE")

        now       = datetime.now(timezone.utc).isoformat()
        branch_id = new_id()

        db[Collections.BRANCHES].insert_one({
            "_id":                    branch_id,
            "name":                   name,
            "address":                address,
            "phone":                  phone,
            "license_number":         license_number,
            "is_active":              is_active,
            "assigned_pharmacist_id": None,
            "assigned_staff_ids":     [],
            "operating_hours":        [],
            "created_at":             now,
            "updated_at":             now,
            **audit_create_fields(current_user),
        })
        created += 1

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="IMPORT",
        resource="branch", resource_id="bulk",
        details={"created": created, "failed": failed},
    )

    return {"created": created, "failed": failed, "errors": errors}


@router.get("/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.BRANCHES].find_one({"_id": branch_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Branch not found")
    return BranchResponse(**doc_to_dict(doc))


@router.patch("/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id:    str,
    payload:      BranchUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    if not db[Collections.BRANCHES].find_one({"_id": branch_id}):
        raise HTTPException(status_code=404, detail="Branch not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.BRANCHES].update_one({"_id": branch_id}, {"$set": updates})

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="branch", resource_id=branch_id,
    )
    doc = db[Collections.BRANCHES].find_one({"_id": branch_id})
    return BranchResponse(**doc_to_dict(doc))
