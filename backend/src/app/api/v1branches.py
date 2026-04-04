from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timezone
from app.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.models.branch import BranchCreate, BranchUpdate, BranchResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/branches", tags=["Branches"])


@router.get("", response_model=PaginatedResponse[BranchResponse])
async def list_branches(
    page:      int  = Query(default=1, ge=1),
    page_size: int  = Query(default=20, ge=1, le=100),
    search:    str | None  = Query(default=None),
    is_active: bool | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    if is_active is not None:
        filter["is_active"] = is_active
    if search:
        filter.update(build_search_filter(search, ["name", "address"]))

    total    = db[Collections.BRANCHES].count_documents(filter)
    skip     = (page - 1) * page_size
    docs     = db[Collections.BRANCHES].find(filter).skip(skip).limit(page_size)
    branches = [BranchResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[BranchResponse](
        data=branches, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
async def create_branch(
    payload:      BranchCreate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()
    branch_id = new_id()

    branch_data = {"_id": branch_id, **payload.model_dump(), "created_at": now, "updated_at": now}
    db[Collections.BRANCHES].insert_one(branch_data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="branch", resource_id=branch_id,
    )
    return BranchResponse(**doc_to_dict(branch_data))


@router.get("/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.BRANCHES].find_one({"_id": branch_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Branch not found")
    return BranchResponse(**doc_to_dict(doc))


@router.patch("/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id:    str,
    payload:      BranchUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    if not db[Collections.BRANCHES].find_one({"_id": branch_id}):
        raise HTTPException(status_code=404, detail="Branch not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    db[Collections.BRANCHES].update_one({"_id": branch_id}, {"$set": updates})

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="branch", resource_id=branch_id,
    )
    doc = db[Collections.BRANCHES].find_one({"_id": branch_id})
    return BranchResponse(**doc_to_dict(doc))
