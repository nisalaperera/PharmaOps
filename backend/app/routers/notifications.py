from fastapi import APIRouter, Depends, Query
from app.database import get_db, Collections, doc_to_dict
from app.middleware.auth_middleware import get_current_user
from app.models.common import paginate

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
async def list_notifications(
    is_read:   bool | None = Query(default=None),
    page:      int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {"user_id": current_user["id"]}
    if is_read is not None: filter["is_read"] = is_read

    total = db[Collections.NOTIFICATIONS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.NOTIFICATIONS].find(filter).sort("created_at", -1).skip(skip).limit(page_size)
    items = [doc_to_dict(d) for d in docs]

    return {"data": items, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, -(-total // page_size))}


@router.patch("/{notification_id}/read")
async def mark_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    db[Collections.NOTIFICATIONS].update_one({"_id": notification_id}, {"$set": {"is_read": True}})
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
