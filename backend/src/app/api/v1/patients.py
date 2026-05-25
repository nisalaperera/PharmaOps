from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.patient import PatientCreate, PatientUpdate, PatientResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/patients", tags=["Patients"])

PATIENT_SORT_FIELDS = {"name", "relationship", "created_at"}


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[PatientResponse])
async def list_patients(
    customer_id: str | None = Query(default=None),
    search:      str | None = Query(default=None),
    page:        int        = Query(default=1, ge=1),
    page_size:   int        = Query(default=20, ge=1, le=100),
    sort_by:     str | None = Query(default="name"),
    sort_dir:    str | None = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    if customer_id:
        flt["customer_id"] = customer_id
    if search:
        flt.update(build_search_filter(search, ["name"]))

    sort_field     = sort_by if sort_by in PATIENT_SORT_FIELDS else "name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.PATIENTS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.PATIENTS].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size)

    return PaginatedResponse[PatientResponse](
        data=[PatientResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=PatientResponse, status_code=201)
async def create_patient(
    payload:      PatientCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()

    customer = db[Collections.CUSTOMERS].find_one({"_id": payload.customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer_name = customer.get("full_name", "")

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id": doc_id,
        **payload.model_dump(),
        "customer_name": customer_name,
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.PATIENTS].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="patient", resource_id=doc_id,
    )
    return PatientResponse(**doc_to_dict(data))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id:   str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.PATIENTS].find_one({"_id": patient_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Patient not found")
    return PatientResponse(**doc_to_dict(doc))


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id:   str,
    payload:      PatientUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    if not db[Collections.PATIENTS].find_one({"_id": patient_id}):
        raise HTTPException(status_code=404, detail="Patient not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.PATIENTS].update_one({"_id": patient_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="patient", resource_id=patient_id,
    )
    return PatientResponse(**doc_to_dict(db[Collections.PATIENTS].find_one({"_id": patient_id})))
