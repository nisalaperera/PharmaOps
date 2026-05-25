from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.doctor import DoctorCreate, DoctorUpdate, DoctorResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/doctors", tags=["Doctors"])

DOCTOR_SORT_FIELDS = {"name", "specialization", "created_at"}


# ── Export (before /{doctor_id}) ──────────────────────────────────────────────

@router.get("/export")
async def export_doctors(
    search:       str | None  = Query(default=None),
    is_active:    bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["name", "specialization", "hospital_or_clinic"]))

    docs   = db[Collections.DOCTORS].find(flt).sort("name", 1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Specialization", "Hospital / Clinic", "License Number", "Phone", "Status"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("name", ""),
            d.get("specialization", ""),
            d.get("hospital_or_clinic", ""),
            d.get("license_number", ""),
            d.get("phone", ""),
            "Active" if d.get("is_active") else "Inactive",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=doctors_export.csv"},
    )


# ── Import template (before /{doctor_id}) ─────────────────────────────────────

@router.get("/import/template")
async def get_import_template(current_user: dict = Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "specialization", "hospital_or_clinic", "license_number", "phone"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=doctors_import_template.csv"},
    )


# ── Import (before /{doctor_id}) ──────────────────────────────────────────────

@router.post("/import")
async def import_doctors(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db      = get_db()
    content = await file.read()
    reader  = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    created = 0
    errors  = []

    for i, row in enumerate(reader, start=2):
        try:
            name     = row.get("name", "").strip()
            phone    = row.get("phone", "").strip()
            spec     = row.get("specialization", "").strip()
            hospital = row.get("hospital_or_clinic", "").strip()
            license_ = row.get("license_number", "").strip()
            if not name or not phone or not spec or not hospital or not license_:
                errors.append({"row": i, "message": "name, specialization, hospital_or_clinic, license_number and phone are required"})
                continue

            now    = datetime.now(timezone.utc).isoformat()
            doc_id = new_id()
            data   = {
                "_id":               doc_id,
                "name":              name,
                "specialization":    spec,
                "hospital_or_clinic": hospital,
                "license_number":    license_,
                "phone":             phone,
                "is_active":         True,
                "created_at":        now,
                "updated_at":        now,
                **audit_create_fields(current_user),
            }
            db[Collections.DOCTORS].insert_one(data)
            created += 1
        except Exception as e:
            errors.append({"row": i, "message": str(e)})

    return {"created": created, "failed": len(errors), "errors": errors}


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[DoctorResponse])
async def list_doctors(
    search:    str | None  = Query(default=None),
    is_active: bool | None = Query(default=None),
    page:      int         = Query(default=1, ge=1),
    page_size: int         = Query(default=20, ge=1, le=100),
    sort_by:   str | None  = Query(default="name"),
    sort_dir:  str | None  = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["name", "specialization", "hospital_or_clinic", "license_number"]))

    sort_field     = sort_by if sort_by in DOCTOR_SORT_FIELDS else "name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.DOCTORS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.DOCTORS].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size)

    return PaginatedResponse[DoctorResponse](
        data=[DoctorResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=DoctorResponse, status_code=status.HTTP_201_CREATED)
async def create_doctor(
    payload:      DoctorCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id": doc_id,
        **payload.model_dump(),
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.DOCTORS].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="doctor", resource_id=doc_id,
    )
    return DoctorResponse(**doc_to_dict(data))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{doctor_id}", response_model=DoctorResponse)
async def get_doctor(
    doctor_id:    str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.DOCTORS].find_one({"_id": doctor_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return DoctorResponse(**doc_to_dict(doc))


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{doctor_id}", response_model=DoctorResponse)
async def update_doctor(
    doctor_id:    str,
    payload:      DoctorUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.DOCTORS].find_one({"_id": doctor_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.DOCTORS].update_one({"_id": doctor_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="doctor", resource_id=doctor_id,
    )
    updated = db[Collections.DOCTORS].find_one({"_id": doctor_id})
    return DoctorResponse(**doc_to_dict(updated))
