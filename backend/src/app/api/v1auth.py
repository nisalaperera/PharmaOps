from fastapi import APIRouter, HTTPException, status
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.config import get_settings
from app.database import get_db, Collections, doc_to_dict
from app.models.user import LoginRequest, TokenResponse, UserResponse
from app.utils.password import verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expire   = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    payload  = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    db             = get_db()
    normalized_email = request.email.lower().strip()

    user_doc = db[Collections.USERS].find_one({
        "email":  normalized_email,
        "status": "ACTIVE",
    })

    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(request.password, user_doc.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Update last login timestamp
    db[Collections.USERS].update_one(
        {"_id": user_doc["_id"]},
        {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
    )

    user_id = str(user_doc["_id"])
    token   = create_access_token(user_id)

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=user_doc["email"],
            full_name=user_doc["full_name"],
            role=user_doc["role"],
            branch_id=user_doc.get("branch_id"),
            status=user_doc.get("status", "ACTIVE"),
            phone=user_doc.get("phone"),
        ),
    )


@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully"}
