from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.prescription import (
    PrescriptionCreate, PrescriptionUpdate, PrescriptionResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/prescriptions", tags=["Prescriptions"])

PRESCRIPTION_SORT_FIELDS = {"patient_name", "doctor_name", "prescription_date", "expiry_date", "created_at"}
BRANCH_LEVEL_ROLES = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}


def _apply_branch_scope(flt: dict, current_user: dict, branch_id: str | None) -> None:
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        flt["branch_id"] = current_user["branch_id"]
    elif branch_id:
        flt["branch_id"] = branch_id


# ── Export (must be before /{prescription_id}) ────────────────────────────────

@router.get("/export")
async def export_prescriptions(
    branch_id:  str | None  = Query(default=None),
    is_active:  bool | None = Query(default=None),
    search:     str | None  = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    _apply_branch_scope(flt, current_user, branch_id)
    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["patient_name", "doctor_name"]))

    docs   = db[Collections.PRESCRIPTIONS].find(flt).sort("created_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Patient", "Doctor", "Prescription Date", "Expiry Date", "Item Count", "Usage Count", "Status"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("patient_name", ""),
            d.get("doctor_name", ""),
            d.get("prescription_date", ""),
            d.get("expiry_date", ""),
            len(d.get("items", [])),
            d.get("usage_count", 0),
            "Active" if d.get("is_active") else "Inactive",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=prescriptions_export.csv"},
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[PrescriptionResponse])
async def list_prescriptions(
    branch_id:  str | None  = Query(default=None),
    patient_id: str | None  = Query(default=None),
    is_active:  bool | None = Query(default=None),
    search:     str | None  = Query(default=None),
    page:       int         = Query(default=1, ge=1),
    page_size:  int         = Query(default=20, ge=1, le=100),
    sort_by:    str | None  = Query(default="created_at"),
    sort_dir:   str | None  = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    _apply_branch_scope(flt, current_user, branch_id)
    if patient_id:  flt["patient_id"] = patient_id
    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["patient_name", "doctor_name"]))

    sort_field     = sort_by if sort_by in PRESCRIPTION_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.PRESCRIPTIONS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.PRESCRIPTIONS].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size)

    return PaginatedResponse[PrescriptionResponse](
        data=[PrescriptionResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_prescription(
    payload:      PrescriptionCreate,
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()

    patient      = db[Collections.PATIENTS].find_one({"_id": payload.patient_id})
    doctor       = db[Collections.DOCTORS].find_one({"_id": payload.doctor_id})
    patient_name = patient.get("name", "") if patient else ""
    doctor_name  = doctor.get("name", "") if doctor else ""

    items = []
    for item in payload.items:
        product      = db[Collections.PRODUCTS].find_one({"_id": item.product_id})
        product_name = product.get("name", item.product_name) if product else item.product_name
        items.append({**item.model_dump(), "product_name": product_name})

    data = {
        "_id":               doc_id,
        "patient_id":        payload.patient_id,
        "patient_name":      patient_name,
        "doctor_id":         payload.doctor_id,
        "doctor_name":       doctor_name,
        "branch_id":         payload.branch_id,
        "items":             items,
        "prescription_date": payload.prescription_date,
        "expiry_date":       payload.expiry_date,
        "is_active":         True,
        "usage_count":       0,
        "created_at":        now,
        "updated_at":        now,
        **audit_create_fields(current_user),
    }
    db[Collections.PRESCRIPTIONS].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="prescription", resource_id=doc_id,
    )
    return PrescriptionResponse(**doc_to_dict(data))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription(
    prescription_id: str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.PRESCRIPTIONS].find_one({"_id": prescription_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return PrescriptionResponse(**doc_to_dict(doc))


# ── Toggle active ─────────────────────────────────────────────────────────────

@router.patch("/{prescription_id}", response_model=PrescriptionResponse)
async def update_prescription(
    prescription_id: str,
    payload:         PrescriptionUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.PRESCRIPTIONS].find_one({"_id": prescription_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Prescription not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.PRESCRIPTIONS].update_one({"_id": prescription_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="prescription", resource_id=prescription_id,
    )
    updated = db[Collections.PRESCRIPTIONS].find_one({"_id": prescription_id})
    return PrescriptionResponse(**doc_to_dict(updated))
