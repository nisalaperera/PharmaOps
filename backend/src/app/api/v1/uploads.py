import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from app.middleware.auth_middleware import get_current_user

router = APIRouter(prefix="/uploads", tags=["Uploads"])

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "uploads", "images")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
MAX_IMAGE_SIZE = 2 * 1024 * 1024


def _ensure_dir():
    os.makedirs(UPLOADS_DIR, exist_ok=True)


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="File must be JPEG, PNG, WebP, or SVG")

    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="File size must not exceed 2 MB")

    _ensure_dir()

    ext = os.path.splitext(file.filename or "image.png")[1] or ".png"
    timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    filename = f"img_{timestamp}{ext}"
    filepath = os.path.join(UPLOADS_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    return {"url": f"/uploads/images/{filename}"}
