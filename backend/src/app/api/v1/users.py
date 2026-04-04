import csv
import io
import secrets
import string
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, docs_to_list, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.models.user import UserCreate, UserUpdate, UserPasswordReset, UserPasswordChange, UserResponse
from app.models.common import PaginatedResponse, paginate
from app.utils.password import hash_password, verify_password
from app.utils.audit import audit_create_fields, audit_update_fields

router = APIRouter(prefix="/users", tags=["Users"])


USER_SORT_FIELDS = {"full_name", "email", "role", "branch_id", "status", "last_login_at", "created_at"}

@router.get("", response_model=PaginatedResponse[UserResponse])
async def list_users(
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search:    str | None = Query(default=None),
    role:      str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    sort_by:   str | None = Query(default="full_name"),
    sort_dir:  str | None = Query(default="asc"),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}

    if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"):
        filter["branch_id"] = current_user["branch_id"]
    elif branch_id:
        filter["branch_id"] = branch_id

    if role:
        filter["role"] = role

    if search:
        filter.update(build_search_filter(search, ["full_name", "email"]))

    sort_field     = sort_by if sort_by in USER_SORT_FIELDS else "full_name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.USERS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.USERS].find(filter, {"password_hash": 0}).sort(sort_field, sort_direction).skip(skip).limit(page_size)
    users = [UserResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[UserResponse](
        data=users, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload:      UserCreate,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()

    if db[Collections.USERS].find_one({"email": payload.email.lower()}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    now     = datetime.now(timezone.utc).isoformat()
    user_id = new_id()

    user_data = {
        "_id":           user_id,
        **payload.model_dump(exclude={"password"}),
        "email":         payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "created_at":    now,
        "updated_at":    now,
        **audit_create_fields(current_user),
    }

    db[Collections.USERS].insert_one(user_data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="user", resource_id=user_id,
    )

    user_data.pop("password_hash", None)
    return UserResponse(**doc_to_dict(user_data))


@router.get("/export")
async def export_users(
    role:      str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    search:    str | None = Query(default=None),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}

    if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"):
        filter["branch_id"] = current_user["branch_id"]
    elif branch_id:
        filter["branch_id"] = branch_id

    if role:
        filter["role"] = role
    if search:
        filter.update(build_search_filter(search, ["full_name", "email"]))

    docs  = db[Collections.USERS].find(filter, {"password_hash": 0}).sort("full_name", 1)
    users = [doc_to_dict(d) for d in docs]

    branch_ids = list({u.get("branch_id") for u in users if u.get("branch_id")})
    branch_map: dict[str, str] = {}
    if branch_ids:
        for b in db[Collections.BRANCHES].find({"_id": {"$in": branch_ids}}, {"name": 1}):
            branch_map[str(b["_id"])] = b["name"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["full_name", "email", "phone", "role", "branch_name", "status", "last_login_at", "created_at"])
    for u in users:
        writer.writerow([
            u.get("full_name", ""),
            u.get("email", ""),
            u.get("phone") or "",
            u.get("role", ""),
            branch_map.get(u.get("branch_id") or "", ""),
            u.get("status", ""),
            u.get("last_login_at") or "",
            u.get("created_at") or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"},
    )


@router.get("/import/template")
async def users_import_template(
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["full_name", "email", "phone", "role", "branch_name", "password", "status"])
    writer.writerow(["John Doe", "john.doe@example.com", "555 123 4567", "BRANCH_USER", "Main Branch", "", "ACTIVE"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_import_template.csv"},
    )


@router.post("/import")
async def import_users(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()

    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader          = csv.DictReader(io.StringIO(text))
    required_columns = {"full_name", "email", "role"}
    if not required_columns.issubset(set(reader.fieldnames or [])):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must include columns: {', '.join(sorted(required_columns))}",
        )

    branch_name_map: dict[str, str] = {}
    for b in db[Collections.BRANCHES].find({}, {"name": 1}):
        branch_name_map[b["name"].strip().lower()] = str(b["_id"])

    valid_roles    = {"ADMIN", "MANAGER", "BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}
    branch_roles   = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}
    valid_statuses = {"ACTIVE", "INACTIVE", "SUSPENDED"}

    created: int       = 0
    failed:  int       = 0
    errors:  list[dict] = []

    for row_num, row in enumerate(reader, start=2):
        full_name   = (row.get("full_name")   or "").strip()
        email       = (row.get("email")       or "").strip().lower()
        phone       = (row.get("phone")       or "").strip() or None
        role        = (row.get("role")        or "").strip().upper()
        branch_name = (row.get("branch_name") or "").strip()
        password    = (row.get("password")    or "").strip()
        status_val  = (row.get("status")      or "ACTIVE").strip().upper()

        if not full_name:
            errors.append({"row": row_num, "message": "full_name is required"})
            failed += 1
            continue
        if not email:
            errors.append({"row": row_num, "message": "email is required"})
            failed += 1
            continue
        if role not in valid_roles:
            errors.append({"row": row_num, "message": f"Invalid role '{role}'. Valid: {', '.join(sorted(valid_roles))}"})
            failed += 1
            continue

        branch_id = None
        if role in branch_roles:
            if not branch_name:
                errors.append({"row": row_num, "message": f"branch_name is required for role {role}"})
                failed += 1
                continue
            branch_id = branch_name_map.get(branch_name.lower())
            if not branch_id:
                errors.append({"row": row_num, "message": f"Branch '{branch_name}' not found"})
                failed += 1
                continue

        if db[Collections.USERS].find_one({"email": email}):
            errors.append({"row": row_num, "message": f"Email '{email}' already registered"})
            failed += 1
            continue

        if not password:
            alphabet = string.ascii_letters + string.digits
            password = "".join(secrets.choice(alphabet) for _ in range(12))

        if status_val not in valid_statuses:
            status_val = "ACTIVE"

        now     = datetime.now(timezone.utc).isoformat()
        user_id = new_id()

        db[Collections.USERS].insert_one({
            "_id":           user_id,
            "full_name":     full_name,
            "email":         email,
            "phone":         phone,
            "role":          role,
            "branch_id":     branch_id,
            "status":        status_val,
            "avatar_url":    None,
            "password_hash": hash_password(password),
            "last_login_at": None,
            "created_at":    now,
            "updated_at":    now,
            **audit_create_fields(current_user),
        })
        created += 1

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="IMPORT",
        resource="user", resource_id="bulk",
        details={"created": created, "failed": failed},
    )

    return {"created": created, "failed": failed, "errors": errors}


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.USERS].find_one({"_id": user_id}, {"password_hash": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**doc_to_dict(doc))


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id:      str,
    payload:      UserUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()
    if not db[Collections.USERS].find_one({"_id": user_id}):
        raise HTTPException(status_code=404, detail="User not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.USERS].update_one({"_id": user_id}, {"$set": updates})

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="user", resource_id=user_id, details=updates,
    )

    doc = db[Collections.USERS].find_one({"_id": user_id}, {"password_hash": 0})
    return UserResponse(**doc_to_dict(doc))


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id:      str,
    payload:      UserPasswordReset,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()
    if not db[Collections.USERS].find_one({"_id": user_id}):
        raise HTTPException(status_code=404, detail="User not found")

    db[Collections.USERS].update_one(
        {"_id": user_id},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "updated_at":    datetime.now(timezone.utc).isoformat(),
            **audit_update_fields(current_user),
        }},
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="RESET_PASSWORD",
        resource="user", resource_id=user_id,
    )


@router.post("/{user_id}/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_user_password(
    user_id:      str,
    payload:      UserPasswordChange,
    current_user: dict = Depends(get_current_user),
):
    if current_user["id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only change your own password")

    db  = get_db()
    doc = db[Collections.USERS].find_one({"_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, doc["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    db[Collections.USERS].update_one(
        {"_id": user_id},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "updated_at":    datetime.now(timezone.utc).isoformat(),
        }},
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CHANGE_PASSWORD",
        resource="user", resource_id=user_id,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id:      str,
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db = get_db()
    if not db[Collections.USERS].find_one({"_id": user_id}):
        raise HTTPException(status_code=404, detail="User not found")

    db[Collections.USERS].update_one(
        {"_id": user_id},
        {"$set": {"status": "INACTIVE", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="DELETE",
        resource="user", resource_id=user_id,
    )
