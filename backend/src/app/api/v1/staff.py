import csv
import io
import re
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.staff import (
    StaffCreate, StaffUpdate, StaffResponse,
    AttendanceCreate, AttendanceUpdate, AttendanceResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/staff", tags=["Staff"])

# ─── Import validation helpers ────────────────────────────────────────────────

_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
_PHONE_DIGITS_RE = re.compile(r'\D')

IMPORT_REQUIRED_COLS   = {"first_name", "last_name", "mobile_1", "role"}
IMPORT_ORG_EXTRA_COLS  = {"branch_id"}   # additionally required for org-level users


_FIELD_LABELS = {
    "first_name":      "First Name",
    "last_name":       "Last Name",
    "mobile_1":        "Mobile 1",
    "mobile_2":        "Mobile 2",
    "landline":        "Landline",
    "whatsapp_number": "WhatsApp",
    "role":            "Job Title",
    "branch_id":       "Branch ID",
    "email":           "Email",
}


def _label(field: str) -> str:
    return _FIELD_LABELS.get(field, field)


def _normalize_phone(value: str, field: str) -> str:
    """Strip non-digit characters, assert exactly 10 digits, return '### ### ####'."""
    digits = _PHONE_DIGITS_RE.sub("", value)
    if len(digits) != 10:
        raise ValueError(
            f"{_label(field)}: '{value}' is not a valid phone number "
            f"(expected 10 digits, got {len(digits)})"
        )
    return f"{digits[:3]} {digits[3:6]} {digits[6:]}"


def _validate_row(
    row:              dict,
    is_branch_scoped: bool,
    current_user:     dict,
    valid_branch_ids: set,
    seen_mobile_1s:   set,
) -> tuple[list[str], dict]:
    """Return (list_of_error_messages, cleaned_doc_fields). cleaned_doc_fields is empty on error."""
    errs = []

    # ── Required text fields ─────────────────────────────────────────────────
    first_name = row.get("first_name", "").strip()
    last_name  = row.get("last_name",  "").strip()
    role       = row.get("role",       "").strip()

    if not first_name:
        errs.append("First Name is required")
    elif len(first_name) > 50:
        errs.append("First Name must be 50 characters or fewer")

    if not last_name:
        errs.append("Last Name is required")
    elif len(last_name) > 50:
        errs.append("Last Name must be 50 characters or fewer")

    if not role:
        errs.append("Job Title is required")

    # ── Branch ───────────────────────────────────────────────────────────────
    if is_branch_scoped:
        effective_branch = current_user["branch_id"]
    else:
        raw_branch = row.get("branch_id", "").strip()
        if not raw_branch:
            errs.append("Branch ID is required")
            effective_branch = ""
        elif raw_branch not in valid_branch_ids:
            errs.append(f"Branch ID '{raw_branch}' does not exist")
            effective_branch = ""
        else:
            effective_branch = raw_branch

    # ── Mobile 1 (required, unique within import batch + existing DB) ─────────
    mobile_1_raw = row.get("mobile_1", "").strip()
    if not mobile_1_raw:
        errs.append("Mobile 1 is required")
        mobile_1 = None
    else:
        try:
            mobile_1 = _normalize_phone(mobile_1_raw, "mobile_1")
            if mobile_1 in seen_mobile_1s:
                errs.append(f"Mobile 1 '{mobile_1}' appears more than once in this file")
                mobile_1 = None
            else:
                seen_mobile_1s.add(mobile_1)
        except ValueError as exc:
            errs.append(str(exc))
            mobile_1 = None

    # ── Optional phone fields ─────────────────────────────────────────────────
    optional_phones = {}
    for field in ("mobile_2", "landline", "whatsapp_number"):
        raw = row.get(field, "").strip()
        if raw:
            try:
                optional_phones[field] = _normalize_phone(raw, field)
            except ValueError as exc:
                errs.append(str(exc))
                optional_phones[field] = None
        else:
            optional_phones[field] = None

    # ── Email (optional) ──────────────────────────────────────────────────────
    email_raw = row.get("email", "").strip()
    if email_raw and not _EMAIL_RE.match(email_raw):
        errs.append(f"Email '{email_raw}' is not a valid email address")
        email_val = None
    else:
        email_val = email_raw or None

    if errs:
        return errs, {}

    return [], {
        "branch_id":       effective_branch,
        "title":           row.get("title", "").strip() or None,
        "first_name":      first_name,
        "last_name":       last_name,
        "mobile_1":        mobile_1,
        "mobile_2":        optional_phones["mobile_2"],
        "landline":        optional_phones["landline"],
        "whatsapp_number": optional_phones["whatsapp_number"],
        "email":           email_val,
        "epf_no":          row.get("epf_no",     "").strip() or None,
        "id_number":       row.get("id_number",  "").strip() or None,
        "address":         row.get("address",    "").strip() or None,
        "role":            role,
        "is_active":       True,
    }


STAFF_SORT_FIELDS = {"first_name", "last_name", "role", "epf_no", "id_number", "created_at"}


# ─── Staff by branch (unpaginated, for dropdowns) ────────────────────────────

@router.get("/by-branch/{branch_id}", response_model=list[StaffResponse])
async def get_staff_by_branch(
    branch_id:    str,
    is_active:    bool | None = Query(default=True),
    current_user: dict        = Depends(require_min_role("BRANCH_USER")),
):
    db = get_db()

    # Branch-level users are scoped to their own branch; ignore the path param.
    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )

    filter: dict = {"branch_id": effective_branch}
    if is_active is not None:
        filter["is_active"] = is_active

    docs  = db[Collections.STAFF].find(filter).sort("epf_no", 1)
    return [StaffResponse(**doc_to_dict(d)) for d in docs]


# ─── Staff CRUD ───────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[StaffResponse])
async def list_staff(
    branch_id:       str | None  = Query(default=None),
    search:          str | None  = Query(default=None),
    is_active:       bool | None = Query(default=None),
    employment_type: str | None  = Query(default=None),
    shift_type:      str | None  = Query(default=None),
    page:            int         = Query(default=1, ge=1),
    page_size:       int         = Query(default=20, ge=1, le=100),
    sort_by:         str | None  = Query(default="last_name"),
    sort_dir:        str | None  = Query(default="asc"),
    current_user:    dict        = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch:
        filter["branch_id"] = effective_branch
    if is_active is not None:
        filter["is_active"] = is_active
    if employment_type:
        filter["employment_type"] = employment_type
    if shift_type:
        filter["shift_type"] = shift_type
    if search:
        filter.update(build_search_filter(search, ["first_name", "last_name", "role", "mobile_1", "epf_no", "id_number"]))

    sort_field     = sort_by if sort_by in STAFF_SORT_FIELDS else "last_name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.STAFF].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.STAFF].find(filter).sort(sort_field, sort_direction).skip(skip).limit(page_size)
    staff = [StaffResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[StaffResponse](
        data=staff, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=StaffResponse, status_code=201)
async def create_staff(
    payload:      StaffCreate,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {"_id": doc_id, **payload.model_dump(), "created_at": now, "updated_at": now, **audit_create_fields(current_user)}
    db[Collections.STAFF].insert_one(data)
    return StaffResponse(**doc_to_dict(data))


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id:     str,
    payload:      StaffUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()
    if not db[Collections.STAFF].find_one({"_id": staff_id}):
        raise HTTPException(status_code=404, detail="Staff member not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.STAFF].update_one({"_id": staff_id}, {"$set": updates})
    return StaffResponse(**doc_to_dict(db[Collections.STAFF].find_one({"_id": staff_id})))


# ─── Export ───────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_staff(
    branch_id:       str | None  = Query(default=None),
    search:          str | None  = Query(default=None),
    is_active:       bool | None = Query(default=None),
    employment_type: str | None  = Query(default=None),
    shift_type:      str | None  = Query(default=None),
    current_user:    dict        = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch:
        filter["branch_id"] = effective_branch
    if is_active is not None:
        filter["is_active"] = is_active
    if employment_type:
        filter["employment_type"] = employment_type
    if shift_type:
        filter["shift_type"] = shift_type
    if search:
        filter.update(build_search_filter(search, ["first_name", "last_name", "role", "mobile_1", "epf_no", "id_number"]))

    docs  = db[Collections.STAFF].find(filter).sort("last_name", 1)
    staff = [doc_to_dict(d) for d in docs]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "title", "first_name", "last_name", "mobile_1", "mobile_2", "landline",
        "whatsapp_number", "email", "epf_no", "id_number", "address",
        "role", "is_active", "branch_id",
    ])
    for s in staff:
        writer.writerow([
            s.get("title", "") or "",
            s.get("first_name", ""),
            s.get("last_name", ""),
            s.get("mobile_1", "") or s.get("phone", ""),
            s.get("mobile_2", "") or "",
            s.get("landline", "") or "",
            s.get("whatsapp_number", "") or "",
            s.get("email", "") or "",
            s.get("epf_no", "") or "",
            s.get("id_number", "") or "",
            s.get("address", "") or "",
            s.get("role", ""),
            str(s.get("is_active", True)).upper(),
            s.get("branch_id", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=staff_export.csv"},
    )


# ─── Import template ──────────────────────────────────────────────────────────

@router.get("/import/template")
async def staff_import_template(
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "branch_id", "title", "first_name", "last_name",
        "mobile_1", "mobile_2", "landline", "whatsapp_number",
        "email", "epf_no", "id_number", "address", "role",
    ])
    writer.writerow([
        "branch_id_here", "Mr.", "Kamal", "Perera",
        "077 123 4567", "", "", "077 987 6543",
        "kamal@example.com", "EPF001", "200012345678", "123 Main St, Colombo", "Pharmacist",
    ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=staff_import_template.csv"},
    )


# ─── Import ───────────────────────────────────────────────────────────────────

@router.post("/import")
async def import_staff(
    file:         UploadFile = File(...),
    current_user: dict       = Depends(require_min_role("BRANCH_ADMIN")),
):
    # ── 1. Decode file ────────────────────────────────────────────────────────
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded.")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="File is empty or has no header row.")

    # ── 2. Check required columns ─────────────────────────────────────────────
    is_branch_scoped = current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
    required_cols    = IMPORT_REQUIRED_COLS | (set() if is_branch_scoped else IMPORT_ORG_EXTRA_COLS)
    actual_cols      = {c.strip() for c in reader.fieldnames}
    missing_cols     = required_cols - actual_cols

    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required column(s): {', '.join(sorted(missing_cols))}",
        )

    # ── 3. Pre-fetch valid branch IDs (org-level users only) ──────────────────
    db = get_db()
    valid_branch_ids: set = set()
    if not is_branch_scoped:
        valid_branch_ids = {str(b["_id"]) for b in db[Collections.BRANCHES].find({}, {"_id": 1})}

    # ── 4. Validate all rows — collect errors, build clean field dicts ────────
    validation_errors = []
    valid_rows        = []   # list of cleaned field dicts ready to insert
    seen_mobile_1s    = set()

    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="File has a header row but no data rows.")

    for row_num, row in enumerate(rows, start=2):
        errs, fields = _validate_row(
            row, is_branch_scoped, current_user, valid_branch_ids, seen_mobile_1s
        )
        if errs:
            validation_errors.append({"row": row_num, "message": "; ".join(errs)})
        else:
            valid_rows.append(fields)

    # ── 5. If any row failed validation, return without inserting anything ─────
    if validation_errors:
        return {
            "created": 0,
            "failed":  len(validation_errors),
            "errors":  validation_errors,
        }

    # ── 6. All rows valid — insert ────────────────────────────────────────────
    now     = datetime.now(timezone.utc).isoformat()
    created = 0
    insert_errors: list[dict] = []

    for idx, fields in enumerate(valid_rows, start=2):
        try:
            doc = {
                "_id":        new_id(),
                **fields,
                "created_at": now,
                "updated_at": now,
                **audit_create_fields(current_user),
            }
            db[Collections.STAFF].insert_one(doc)
            created += 1
        except Exception as exc:
            insert_errors.append({"row": idx, "message": str(exc)})

    return {
        "created": created,
        "failed":  len(insert_errors),
        "errors":  insert_errors,
    }


ATTENDANCE_SORT_FIELDS = {"date", "staff_name", "shift_type", "status", "created_at"}


# ─── Attendance CRUD ──────────────────────────────────────────────────────────

@router.get("/attendance", response_model=PaginatedResponse[AttendanceResponse])
async def list_attendance(
    staff_id:     str | None = Query(default=None),
    branch_id:    str | None = Query(default=None),
    date_from:    str | None = Query(default=None),
    date_to:      str | None = Query(default=None),
    status:       str | None = Query(default=None),
    shift_type:   str | None = Query(default=None),
    search:       str | None = Query(default=None),
    page:         int        = Query(default=1, ge=1),
    page_size:    int        = Query(default=20, ge=1, le=100),
    sort_by:      str | None = Query(default="date"),
    sort_dir:     str | None = Query(default="desc"),
    current_user: dict       = Depends(require_min_role("BRANCH_USER")),
):
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch:
        filter["branch_id"] = effective_branch
    if staff_id:
        filter["staff_id"] = staff_id
    if status:
        filter["status"] = status
    if shift_type:
        filter["shift_type"] = shift_type
    if date_from or date_to:
        date_filter = {}
        if date_from: date_filter["$gte"] = date_from
        if date_to:   date_filter["$lte"] = date_to
        filter["date"] = date_filter
    if search:
        filter.update(build_search_filter(search, ["staff_name"]))

    sort_field     = sort_by if sort_by in ATTENDANCE_SORT_FIELDS else "date"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.ATTENDANCE].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.ATTENDANCE].find(filter).sort(sort_field, sort_direction).skip(skip).limit(page_size)
    items = [AttendanceResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[AttendanceResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("/attendance", response_model=AttendanceResponse, status_code=201)
async def clock_in_out(
    payload:      AttendanceCreate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db = get_db()

    # Block duplicate open record: same staff + same date with no clock_out
    open_record = db[Collections.ATTENDANCE].find_one({
        "staff_id":  payload.staff_id,
        "date":      payload.date,
        "clock_out": None,
    })
    if open_record:
        raise HTTPException(
            status_code=409,
            detail="An open attendance record (no clock-out) already exists for this staff member on this date. Please close it before adding a new entry.",
        )

    doc_id     = new_id()
    staff_doc  = db[Collections.STAFF].find_one({"_id": payload.staff_id})
    staff_name = ""
    if staff_doc:
        parts      = [staff_doc.get("title") or "", staff_doc.get("first_name", ""), staff_doc.get("last_name", "")]
        staff_name = " ".join(p for p in parts if p)
    now  = datetime.now(timezone.utc).isoformat()
    data = {
        "_id":        doc_id,
        **payload.model_dump(),
        "staff_name": staff_name,
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.ATTENDANCE].insert_one(data)
    return AttendanceResponse(**doc_to_dict(data))


@router.patch("/attendance/{attendance_id}", response_model=AttendanceResponse)
async def update_attendance(
    attendance_id: str,
    payload:       AttendanceUpdate,
    current_user:  dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()
    if not db[Collections.ATTENDANCE].find_one({"_id": attendance_id}):
        raise HTTPException(status_code=404, detail="Attendance record not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.ATTENDANCE].update_one({"_id": attendance_id}, {"$set": updates})
    return AttendanceResponse(**doc_to_dict(db[Collections.ATTENDANCE].find_one({"_id": attendance_id})))


@router.get("/attendance/totals")
async def get_attendance_totals(
    staff_id:     str | None = Query(default=None),
    branch_id:    str | None = Query(default=None),
    date_from:    str | None = Query(default=None),
    date_to:      str | None = Query(default=None),
    status:       str | None = Query(default=None),
    shift_type:   str | None = Query(default=None),
    search:       str | None = Query(default=None),
    current_user: dict       = Depends(require_min_role("BRANCH_USER")),
):
    """Return total worked minutes for all records matching the given filters."""
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch:
        filter["branch_id"] = effective_branch
    if staff_id:
        filter["staff_id"] = staff_id
    if status:
        filter["status"] = status
    if shift_type:
        filter["shift_type"] = shift_type
    if date_from or date_to:
        date_filter = {}
        if date_from: date_filter["$gte"] = date_from
        if date_to:   date_filter["$lte"] = date_to
        filter["date"] = date_filter
    if search:
        filter.update(build_search_filter(search, ["staff_name"]))

    docs          = db[Collections.ATTENDANCE].find(filter, {"clock_in": 1, "clock_out": 1})
    total_minutes = 0
    for doc in docs:
        clock_in  = doc.get("clock_in")
        clock_out = doc.get("clock_out")
        if clock_in and clock_out:
            try:
                in_h,  in_m  = map(int, clock_in.split(":"))
                out_h, out_m = map(int, clock_out.split(":"))
                diff = (out_h * 60 + out_m) - (in_h * 60 + in_m)
                if diff > 0:
                    total_minutes += diff
            except Exception:
                pass

    return {"total_minutes": total_minutes}


@router.get("/attendance/export")
async def export_attendance(
    staff_id:     str | None = Query(default=None),
    branch_id:    str | None = Query(default=None),
    date_from:    str | None = Query(default=None),
    date_to:      str | None = Query(default=None),
    status:       str | None = Query(default=None),
    shift_type:   str | None = Query(default=None),
    current_user: dict       = Depends(require_min_role("BRANCH_USER")),
):
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch:
        filter["branch_id"] = effective_branch
    if staff_id:
        filter["staff_id"] = staff_id
    if status:
        filter["status"] = status
    if shift_type:
        filter["shift_type"] = shift_type
    if date_from or date_to:
        date_filter = {}
        if date_from: date_filter["$gte"] = date_from
        if date_to:   date_filter["$lte"] = date_to
        filter["date"] = date_filter

    docs  = db[Collections.ATTENDANCE].find(filter).sort("date", -1)
    items = [doc_to_dict(d) for d in docs]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["staff_name", "date", "clock_in", "clock_out", "notes"])
    for a in items:
        writer.writerow([
            a.get("staff_name", ""),
            a.get("date", ""),
            a.get("clock_in", "") or "",
            a.get("clock_out", "") or "",
            a.get("notes", "") or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance_export.csv"},
    )
