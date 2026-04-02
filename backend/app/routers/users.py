from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timezone
from app.database import get_db, Collections, new_id, doc_to_dict, docs_to_list, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.models.user import UserCreate, UserUpdate, UserPasswordReset, UserResponse
from app.models.common import PaginatedResponse, paginate
from app.utils.password import hash_password

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=PaginatedResponse[UserResponse])
async def list_users(
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search:    str | None = Query(default=None),
    role:      str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
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

    total = db[Collections.USERS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.USERS].find(filter, {"password_hash": 0}).skip(skip).limit(page_size)
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
    }

    db[Collections.USERS].insert_one(user_data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="user", resource_id=user_id,
    )

    user_data.pop("password_hash", None)
    return UserResponse(**doc_to_dict(user_data))


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
        }},
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="RESET_PASSWORD",
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
