from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields
from app.models.payroll import PayrollCreate, PayrollResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/staff/payroll", tags=["Staff"])

PAYROLL_SORT_FIELDS = {"staff_name", "month", "year", "gross_salary", "net_salary", "created_at"}

MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

BRANCH_LEVEL_ROLES = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}


def _apply_branch_scope(flt: dict, current_user: dict, branch_id: str | None):
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        flt["branch_id"] = current_user["branch_id"]
    elif branch_id:
        flt["branch_id"] = branch_id


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[PayrollResponse])
async def list_payroll(
    branch_id: str | None  = Query(default=None),
    staff_id:  str | None  = Query(default=None),
    month:     int | None  = Query(default=None, ge=1, le=12),
    year:      int | None  = Query(default=None, ge=2020),
    is_paid:   bool | None = Query(default=None),
    search:    str | None  = Query(default=None),
    page:      int         = Query(default=1, ge=1),
    page_size: int         = Query(default=20, ge=1, le=100),
    sort_by:   str | None  = Query(default="created_at"),
    sort_dir:  str | None  = Query(default="desc"),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db  = get_db()
    flt: dict = {}

    _apply_branch_scope(flt, current_user, branch_id)

    if staff_id:            flt["staff_id"] = staff_id
    if month is not None:   flt["month"]    = month
    if year is not None:    flt["year"]     = year
    if is_paid is not None: flt["is_paid"]  = is_paid
    if search:              flt.update(build_search_filter(search, ["staff_name"]))

    sort_field     = sort_by if sort_by in PAYROLL_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.PAYROLL].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.PAYROLL].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size)

    return PaginatedResponse[PayrollResponse](
        data=[PayrollResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Export (must come before /{payroll_id}) ───────────────────────────────────

@router.get("/export")
async def export_payroll(
    branch_id: str | None  = Query(default=None),
    staff_id:  str | None  = Query(default=None),
    month:     int | None  = Query(default=None, ge=1, le=12),
    year:      int | None  = Query(default=None, ge=2020),
    is_paid:   bool | None = Query(default=None),
    search:    str | None  = Query(default=None),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db  = get_db()
    flt: dict = {}

    _apply_branch_scope(flt, current_user, branch_id)

    if staff_id:            flt["staff_id"] = staff_id
    if month is not None:   flt["month"]    = month
    if year is not None:    flt["year"]     = year
    if is_paid is not None: flt["is_paid"]  = is_paid
    if search:              flt.update(build_search_filter(search, ["staff_name"]))

    docs   = db[Collections.PAYROLL].find(flt).sort("created_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Staff Member", "Month", "Year",
        "Basic Salary", "Overtime Pay", "Gross Salary",
        "Total Deductions", "Net Salary", "Status",
    ])
    for doc in docs:
        d = doc_to_dict(doc)
        month_num = d.get("month", 1)
        writer.writerow([
            d.get("staff_name", ""),
            MONTH_ABBR[month_num - 1] if 1 <= month_num <= 12 else str(month_num),
            d.get("year", ""),
            f"{d.get('basic_salary', 0):.2f}",
            f"{d.get('overtime_pay', 0):.2f}",
            f"{d.get('gross_salary', 0):.2f}",
            f"{d.get('total_deductions', 0):.2f}",
            f"{d.get('net_salary', 0):.2f}",
            "Paid" if d.get("is_paid") else "Unpaid",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=payroll_export.csv"},
    )


# ── Generate payroll ──────────────────────────────────────────────────────────

@router.post("", response_model=PayrollResponse, status_code=201)
async def generate_payroll(
    payload:      PayrollCreate,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()

    staff_doc = db[Collections.STAFF].find_one({"_id": payload.staff_id})
    if not staff_doc:
        raise HTTPException(status_code=404, detail="Staff member not found")

    first_name = staff_doc.get("first_name", "")
    last_name  = staff_doc.get("last_name",  "")
    staff_name = f"{first_name} {last_name}".strip()

    basic_salary     = float(staff_doc.get("base_salary") or 0)
    overtime_pay     = 0.0
    gross_salary     = basic_salary + overtime_pay
    total_deductions = sum(d.amount for d in payload.deductions)
    net_salary       = gross_salary - total_deductions

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id":              doc_id,
        **payload.model_dump(),
        "staff_name":       staff_name,
        "basic_salary":     basic_salary,
        "overtime_pay":     overtime_pay,
        "gross_salary":     gross_salary,
        "total_deductions": total_deductions,
        "net_salary":       net_salary,
        "is_paid":          False,
        "paid_at":          None,
        "paid_by":          None,
        "created_at":       now,
        "updated_at":       now,
        **audit_create_fields(current_user),
    }
    db[Collections.PAYROLL].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="payroll", resource_id=doc_id,
    )
    return PayrollResponse(**doc_to_dict(data))


# ── Mark as paid ──────────────────────────────────────────────────────────────

@router.post("/{payroll_id}/pay", response_model=PayrollResponse)
async def mark_as_paid(
    payroll_id:   str,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()
    doc = db[Collections.PAYROLL].find_one({"_id": payroll_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    if doc.get("is_paid"):
        raise HTTPException(status_code=400, detail="Payroll record is already marked as paid")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PAYROLL].update_one(
        {"_id": payroll_id},
        {"$set": {
            "is_paid":    True,
            "paid_at":    now,
            "paid_by":    current_user["id"],
            "updated_at": now,
        }},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="payroll", resource_id=payroll_id,
    )
    return PayrollResponse(**doc_to_dict(db[Collections.PAYROLL].find_one({"_id": payroll_id})))
