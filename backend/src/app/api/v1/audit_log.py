from fastapi import APIRouter, Depends, Query
from pymongo import ASCENDING, DESCENDING
from app.core.database import get_db, Collections, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role

router = APIRouter(prefix="/audit-log", tags=["Audit Log"])

AUDIT_SORT_FIELDS = {"timestamp", "action", "resource", "user_email"}


@router.get("")
async def list_audit_logs(
    user_id:   str | None = Query(default=None),
    action:    str | None = Query(default=None),
    resource:  str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to:   str | None = Query(default=None),
    search:    str | None = Query(default=None),
    sort_by:   str = Query(default="timestamp"),
    sort_dir:  str = Query(default="desc"),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    current_user: dict = Depends(require_min_role("ADMIN")),
):
    db     = get_db()
    filter = {}
    if user_id:   filter["user_id"]   = user_id
    if action:    filter["action"]    = action
    if resource:  filter["resource"]  = resource
    if branch_id: filter["branch_id"] = branch_id
    if date_from or date_to:
        date_filter: dict = {}
        if date_from: date_filter["$gte"] = date_from
        if date_to:   date_filter["$lte"] = date_to + "T23:59:59"
        filter["timestamp"] = date_filter
    filter.update(build_search_filter(search, ["user_email", "resource_id"]))

    sort_field = sort_by if sort_by in AUDIT_SORT_FIELDS else "timestamp"
    sort_order = ASCENDING if sort_dir == "asc" else DESCENDING

    total = db[Collections.AUDIT_LOGS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.AUDIT_LOGS].find(filter).sort(sort_field, sort_order).skip(skip).limit(page_size)
    items = [doc_to_dict(d) for d in docs]

    return {"data": items, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, -(-total // page_size))}
