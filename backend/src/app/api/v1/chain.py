import os
import shutil
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.core.config import get_settings
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.chain import ChainUpdate, ChainResponse, ChainSettings, ChainHRParams

router = APIRouter(prefix="/chain", tags=["Chain"])

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "uploads", "logos")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024


def _ensure_uploads_dir():
    os.makedirs(UPLOADS_DIR, exist_ok=True)


def _get_or_create_chain(db, current_user: dict | None = None) -> dict:
    doc = db[Collections.CHAIN].find_one()
    if doc:
        return doc_to_dict(doc)

    settings = get_settings()
    now = datetime.now(timezone.utc).isoformat()
    chain_id = new_id()
    chain_doc = {
        "_id":          chain_id,
        "name":         "Medi Guide Pharmacy",
        "logo":         None,
        "chain_prefix": settings.chain_prefix,
        "contacts":     [],
        "settings":     ChainSettings().model_dump(),
        "hr_params":    ChainHRParams().model_dump(),
        "created_at":   now,
        "updated_at":   now,
    }
    if current_user:
        chain_doc.update(audit_create_fields(current_user))
    db[Collections.CHAIN].insert_one(chain_doc)
    return doc_to_dict(chain_doc)


@router.get("", response_model=ChainResponse)
async def get_chain(current_user: dict = Depends(get_current_user)):
    db = get_db()
    chain = _get_or_create_chain(db, current_user)
    return ChainResponse(**chain)


@router.patch("", response_model=ChainResponse)
async def update_chain(
    payload:      ChainUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db = get_db()
    chain = _get_or_create_chain(db, current_user)

    updates = {}
    dump = payload.model_dump(exclude_none=True)
    for key, value in dump.items():
        if key in ("settings", "hr_params") and isinstance(value, dict):
            updates[key] = value
        elif key == "contacts" and isinstance(value, list):
            updates["contacts"] = [c if isinstance(c, dict) else c for c in value]
        else:
            updates[key] = value

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.CHAIN].update_one({"_id": chain["id"]}, {"$set": updates})

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="chain", resource_id=chain["id"],
    )

    doc = db[Collections.CHAIN].find_one({"_id": chain["id"]})
    return ChainResponse(**doc_to_dict(doc))


@router.post("/logo")
async def upload_chain_logo(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="File must be JPEG, PNG, or WebP")

    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="File size must not exceed 2 MB")

    _ensure_uploads_dir()

    ext = os.path.splitext(file.filename or "logo.png")[1] or ".png"
    timestamp = int(datetime.now(timezone.utc).timestamp())
    filename = f"chain_logo_{timestamp}{ext}"
    filepath = os.path.join(UPLOADS_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    logo_url = f"/uploads/logos/{filename}"

    db = get_db()
    chain = _get_or_create_chain(db, current_user)
    db[Collections.CHAIN].update_one(
        {"_id": chain["id"]},
        {"$set": {
            "logo": logo_url,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            **audit_update_fields(current_user),
        }},
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="chain", resource_id=chain["id"],
        details={"field": "logo", "filename": filename},
    )

    return {"logo_url": logo_url}
