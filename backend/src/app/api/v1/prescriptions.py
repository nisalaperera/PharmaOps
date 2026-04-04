from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user
from app.models.prescription import (
    PrescriptionCreate, PrescriptionResponse,
    DoctorCreate, DoctorUpdate, DoctorResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/prescriptions", tags=["Prescriptions"])


@router.get("/doctors", response_model=list[DoctorResponse])
async def list_doctors(search: str | None = Query(default=None), current_user: dict = Depends(get_current_user)):
    db     = get_db()
    filter = build_search_filter(search, ["name"]) if search else {}
    return [DoctorResponse(**doc_to_dict(d)) for d in db[Collections.DOCTORS].find(filter)]


@router.post("/doctors", response_model=DoctorResponse, status_code=201)
async def create_doctor(payload: DoctorCreate, current_user: dict = Depends(get_current_user)):
    db     = get_db()
    doc_id = new_id()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    db[Collections.DOCTORS].insert_one(data)
    return DoctorResponse(**doc_to_dict(data))


@router.patch("/doctors/{doctor_id}", response_model=DoctorResponse)
async def update_doctor(doctor_id: str, payload: DoctorUpdate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if not db[Collections.DOCTORS].find_one({"_id": doctor_id}):
        raise HTTPException(status_code=404, detail="Doctor not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    db[Collections.DOCTORS].update_one({"_id": doctor_id}, {"$set": updates})
    return DoctorResponse(**doc_to_dict(db[Collections.DOCTORS].find_one({"_id": doctor_id})))


@router.get("", response_model=PaginatedResponse[PrescriptionResponse])
async def list_prescriptions(
    patient_id:  str | None = Query(default=None),
    branch_id:   str | None = Query(default=None),
    page:        int = Query(default=1, ge=1),
    page_size:   int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}
    if patient_id: filter["patient_id"] = patient_id

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch: filter["branch_id"] = effective_branch

    total = db[Collections.PRESCRIPTIONS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.PRESCRIPTIONS].find(filter).skip(skip).limit(page_size)
    items = [PrescriptionResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[PrescriptionResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=PrescriptionResponse, status_code=201)
async def create_prescription(payload: PrescriptionCreate, current_user: dict = Depends(get_current_user)):
    db     = get_db()
    doc_id = new_id()
    data   = {
        "_id": doc_id, **payload.model_dump(),
        "is_active": True, "usage_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db[Collections.PRESCRIPTIONS].insert_one(data)
    return PrescriptionResponse(**doc_to_dict(data))


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription(prescription_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.PRESCRIPTIONS].find_one({"_id": prescription_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return PrescriptionResponse(**doc_to_dict(doc))
