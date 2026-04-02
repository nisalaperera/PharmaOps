from fastapi import APIRouter, Depends, Query
from app.database import get_db, Collections, doc_to_dict
from app.middleware.auth_middleware import require_min_role

router = APIRouter(prefix="/audit-log", tags=["Audit Log"])


@router.get("")
async def list_audit_logs(
    user_id:   str | None = Query(default=None),
    resource:  str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    current_user: dict = Depends(require_min_role("ADMIN")),
):
    db     = get_db()
    filter = {}
    if user_id:   filter["user_id"]   = user_id
    if resource:  filter["resource"]  = resource
    if branch_id: filter["branch_id"] = branch_id

    total = db[Collections.AUDIT_LOGS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.AUDIT_LOGS].find(filter).sort("timestamp", -1).skip(skip).limit(page_size)
    items = [doc_to_dict(d) for d in docs]

    return {"data": items, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, -(-total // page_size))}
