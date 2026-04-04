from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import require_min_role
from app.models.payroll import PayrollCreate, PayrollUpdate, PayrollResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/payroll", tags=["Payroll"])


@router.get("", response_model=PaginatedResponse[PayrollResponse])
async def list_payroll(
    staff_id:  str | None  = Query(default=None),
    month:     int | None  = Query(default=None),
    year:      int | None  = Query(default=None),
    is_paid:   bool | None = Query(default=None),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}
    if staff_id:            filter["staff_id"] = staff_id
    if month:               filter["month"]    = month
    if year:                filter["year"]     = year
    if is_paid is not None: filter["is_paid"]  = is_paid

    total = db[Collections.PAYROLL].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.PAYROLL].find(filter).skip(skip).limit(page_size)
    items = [PayrollResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[PayrollResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=PayrollResponse, status_code=201)
async def generate_payroll(payload: PayrollCreate, current_user: dict = Depends(require_min_role("BRANCH_ADMIN"))):
    db = get_db()

    staff_doc = db[Collections.STAFF].find_one({"_id": payload.staff_id})
    if not staff_doc:
        raise HTTPException(status_code=404, detail="Staff member not found")

    basic_salary     = staff_doc.get("base_salary") or 0.0
    overtime_pay     = 0.0
    gross_salary     = basic_salary + overtime_pay
    total_deductions = sum(d.amount for d in payload.deductions)
    net_salary       = gross_salary - total_deductions

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id":              doc_id,
        **payload.model_dump(),
        "staff_name":       staff_doc.get("full_name", ""),
        "basic_salary":     basic_salary,
        "overtime_pay":     overtime_pay,
        "gross_salary":     gross_salary,
        "total_deductions": total_deductions,
        "net_salary":       net_salary,
        "is_paid":          False,
        "created_at":       now,
        "updated_at":       now,
    }
    db[Collections.PAYROLL].insert_one(data)
    return PayrollResponse(**doc_to_dict(data))


@router.post("/{payroll_id}/pay", response_model=PayrollResponse)
async def mark_as_paid(payroll_id: str, current_user: dict = Depends(require_min_role("BRANCH_ADMIN"))):
    db = get_db()
    if not db[Collections.PAYROLL].find_one({"_id": payroll_id}):
        raise HTTPException(status_code=404, detail="Payroll record not found")
    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PAYROLL].update_one(
        {"_id": payroll_id},
        {"$set": {"is_paid": True, "paid_at": now, "paid_by": current_user["id"], "updated_at": now}},
    )
    return PayrollResponse(**doc_to_dict(db[Collections.PAYROLL].find_one({"_id": payroll_id})))
