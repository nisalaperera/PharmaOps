from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ASCENDING, DESCENDING
from app.core.database import get_db, Collections, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])

NOTIFICATION_SORT_FIELDS = {"created_at", "type", "is_read"}


@router.get("")
async def list_notifications(
    is_read:   bool | None = Query(default=None),
    type:      str | None = Query(default=None),
    search:    str | None = Query(default=None),
    sort_by:   str = Query(default="created_at"),
    sort_dir:  str = Query(default="desc"),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {"user_id": current_user["id"]}
    if is_read is not None: filter["is_read"] = is_read
    if type:                filter["type"]    = type
    filter.update(build_search_filter(search, ["title", "message"]))

    sort_field = sort_by if sort_by in NOTIFICATION_SORT_FIELDS else "created_at"
    sort_order = ASCENDING if sort_dir == "asc" else DESCENDING

    total = db[Collections.NOTIFICATIONS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.NOTIFICATIONS].find(filter).sort(sort_field, sort_order).skip(skip).limit(page_size)
    items = [doc_to_dict(d) for d in docs]

    return {"data": items, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, -(-total // page_size))}


@router.patch("/{notification_id}/read")
async def mark_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    db     = get_db()
    result = db[Collections.NOTIFICATIONS].update_one(
        {"_id": notification_id, "user_id": current_user["id"]},
        {"$set": {"is_read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@router.patch("/mark-all-read")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    db     = get_db()
    result = db[Collections.NOTIFICATIONS].update_many(
        {"user_id": current_user["id"], "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"updated": result.modified_count}


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    db    = get_db()
    count = db[Collections.NOTIFICATIONS].count_documents({"user_id": current_user["id"], "is_read": False})
    return {"count": count}
