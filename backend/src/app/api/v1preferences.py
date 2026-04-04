from fastapi import APIRouter, Depends
from app.database import get_db, Collections
from app.middleware.auth_middleware import get_current_user
from app.models.preferences import UserPreferencesUpdate, UserPreferencesResponse

router = APIRouter(prefix="/preferences", tags=["Preferences"])


@router.get("/me", response_model=UserPreferencesResponse)
async def get_preferences(current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.PREFERENCES].find_one({"user_id": current_user["id"]})
    if not doc:
        return UserPreferencesResponse(user_id=current_user["id"])
    return UserPreferencesResponse(user_id=doc["user_id"], theme=doc.get("theme", "system"))


@router.put("/me", response_model=UserPreferencesResponse)
async def update_preferences(
    payload:      UserPreferencesUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    db[Collections.PREFERENCES].update_one(
        {"user_id": current_user["id"]},
        {"$set": {"user_id": current_user["id"], "theme": payload.theme}},
        upsert=True,
    )
    return UserPreferencesResponse(user_id=current_user["id"], theme=payload.theme)
