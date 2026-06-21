import asyncio
from fastapi import APIRouter, HTTPException, Request, status
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.core.config import get_settings
from app.core.database import get_db, Collections, doc_to_dict
from app.middleware.audit_middleware import log_audit
from app.models.user import LoginRequest, TokenResponse, UserResponse
from app.utils.password import verify_password
from app.utils.rate_limit import is_rate_limited, record_failed_attempt, clear_attempts

router = APIRouter(prefix="/auth", tags=["Authentication"])


def create_access_token(
    user_id: str, role: str, branch_id: str | None = None
) -> str:
    settings = get_settings()
    expire   = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    payload  = {
        "sub":       user_id,
        "role":      role,
        "branch_id": branch_id,
        "exp":       expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, http_request: Request):
    settings         = get_settings()
    db               = get_db()
    normalized_email = request.email.lower().strip()

    client_ip      = http_request.client.host if http_request.client else "unknown"
    rate_limit_key = f"{normalized_email}|{client_ip}"
    window_seconds = settings.login_window_minutes * 60

    if is_rate_limited(rate_limit_key, settings.login_max_attempts, window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {settings.login_window_minutes} minutes.",
        )

    async def _reject_invalid():
        record_failed_attempt(rate_limit_key)
        await log_audit(
            user_id="", user_email=normalized_email, user_role="",
            action="LOGIN_FAILED", resource="auth", ip_address=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user_doc = db[Collections.USERS].find_one({
        "email":  normalized_email,
        "status": "ACTIVE",
    })

    if not user_doc:
        await _reject_invalid()

    loop             = asyncio.get_running_loop()
    password_matches = await loop.run_in_executor(
        None, verify_password, request.password, user_doc.get("password_hash", "")
    )
    if not password_matches:
        await _reject_invalid()

    clear_attempts(rate_limit_key)

    # Update last login timestamp
    db[Collections.USERS].update_one(
        {"_id": user_doc["_id"]},
        {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
    )

    user_id = str(user_doc["_id"])
    token   = create_access_token(
        user_id,
        role=user_doc["role"],
        branch_id=user_doc.get("branch_id"),
    )

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
