from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.models.patient import PatientCreate, PatientUpdate, PatientResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/patients", tags=["Patients"])


@router.get("", response_model=PaginatedResponse[PatientResponse])
async def list_patients(
    search:    str | None = Query(default=None),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = build_search_filter(search, ["full_name", "phone"]) if search else {}
    total    = db[Collections.PATIENTS].count_documents(filter)
    skip     = (page - 1) * page_size
    docs     = db[Collections.PATIENTS].find(filter).skip(skip).limit(page_size)
    patients = [PatientResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[PatientResponse](
        data=patients, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=PatientResponse, status_code=201)
async def create_patient(payload: PatientCreate, current_user: dict = Depends(get_current_user)):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {"_id": doc_id, **payload.model_dump(), "outstanding_balance": 0.0, "created_at": now, "updated_at": now}
    db[Collections.PATIENTS].insert_one(data)
    return PatientResponse(**doc_to_dict(data))


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.PATIENTS].find_one({"_id": patient_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Patient not found")
    return PatientResponse(**doc_to_dict(doc))


@router.patch("/{patient_id}", response_model=PatientResponse)
async def update_patient(patient_id: str, payload: PatientUpdate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if not db[Collections.PATIENTS].find_one({"_id": patient_id}):
        raise HTTPException(status_code=404, detail="Patient not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    db[Collections.PATIENTS].update_one({"_id": patient_id}, {"$set": updates})
    return PatientResponse(**doc_to_dict(db[Collections.PATIENTS].find_one({"_id": patient_id})))


@router.patch("/{patient_id}/credit-limit", response_model=PatientResponse)
async def update_credit_limit(
    patient_id:   str,
    credit_limit: float,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    if not db[Collections.PATIENTS].find_one({"_id": patient_id}):
        raise HTTPException(status_code=404, detail="Patient not found")
    db[Collections.PATIENTS].update_one(
        {"_id": patient_id},
        {"$set": {"credit_limit": credit_limit, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return PatientResponse(**doc_to_dict(db[Collections.PATIENTS].find_one({"_id": patient_id})))
