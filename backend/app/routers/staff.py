from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.models.staff import (
    StaffCreate, StaffUpdate, StaffResponse,
    AttendanceCreate, AttendanceUpdate, AttendanceResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/staff", tags=["Staff & Attendance"])


@router.get("", response_model=PaginatedResponse[StaffResponse])
async def list_staff(
    branch_id: str | None = Query(default=None),
    search:    str | None = Query(default=None),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}
    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER")
        else branch_id
    )
    if effective_branch: filter["branch_id"] = effective_branch
    if search: filter.update(build_search_filter(search, ["full_name"]))

    total = db[Collections.STAFF].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.STAFF].find(filter).skip(skip).limit(page_size)
    staff = [StaffResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[StaffResponse](
        data=staff, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=StaffResponse, status_code=201)
async def create_staff(payload: StaffCreate, current_user: dict = Depends(require_min_role("BRANCH_ADMIN"))):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now, "updated_at": now}
    db[Collections.STAFF].insert_one(data)
    return StaffResponse(**doc_to_dict(data))


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(staff_id: str, payload: StaffUpdate, current_user: dict = Depends(require_min_role("BRANCH_ADMIN"))):
    db = get_db()
    if not db[Collections.STAFF].find_one({"_id": staff_id}):
        raise HTTPException(status_code=404, detail="Staff member not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    db[Collections.STAFF].update_one({"_id": staff_id}, {"$set": updates})
    return StaffResponse(**doc_to_dict(db[Collections.STAFF].find_one({"_id": staff_id})))


# ─── Attendance ───────────────────────────────────────────────────────────────

@router.get("/attendance", response_model=PaginatedResponse[AttendanceResponse])
async def list_attendance(
    staff_id:  str | None = Query(default=None),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}
    if staff_id: filter["staff_id"] = staff_id

    total = db[Collections.ATTENDANCE].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.ATTENDANCE].find(filter).sort("date", -1).skip(skip).limit(page_size)
    items = [AttendanceResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[AttendanceResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("/attendance", response_model=AttendanceResponse, status_code=201)
async def clock_in_out(payload: AttendanceCreate, current_user: dict = Depends(get_current_user)):
    db     = get_db()
    doc_id = new_id()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    db[Collections.ATTENDANCE].insert_one(data)
    return AttendanceResponse(**doc_to_dict(data))


@router.patch("/attendance/{attendance_id}", response_model=AttendanceResponse)
async def update_attendance(attendance_id: str, payload: AttendanceUpdate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if not db[Collections.ATTENDANCE].find_one({"_id": attendance_id}):
        raise HTTPException(status_code=404, detail="Attendance record not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    db[Collections.ATTENDANCE].update_one({"_id": attendance_id}, {"$set": updates})
    return AttendanceResponse(**doc_to_dict(db[Collections.ATTENDANCE].find_one({"_id": attendance_id})))
