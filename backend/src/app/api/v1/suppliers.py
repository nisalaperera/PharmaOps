from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io, re
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierType
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

SUPPLIER_SORT_FIELDS = {"short_name", "legal_name", "created_at"}


def _denormalize_agency_names(db, distributor_channels: list) -> list:
    """Fills agency_name on DistributorChannels where channel_category is AGENCY."""
    for ch in distributor_channels:
        if isinstance(ch, dict):
            if ch.get("channel_category") == "AGENCY" and ch.get("agency_id"):
                agency_doc = db[Collections.SUPPLIERS].find_one({"_id": ch["agency_id"]})
                if agency_doc:
                    ch["agency_name"] = agency_doc.get("short_name", "")
        else:
            if ch.channel_category == "AGENCY" and ch.agency_id:
                agency_doc = db[Collections.SUPPLIERS].find_one({"_id": ch.agency_id})
                if agency_doc:
                    ch.agency_name = agency_doc.get("short_name", "")
    return distributor_channels


# ── Agencies list (for Distributor channel dropdowns) — BEFORE /{id} ─────────

@router.get("/agencies")
async def list_agencies(
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    docs = db[Collections.SUPPLIERS].find(
        {"supplier_type": "AGENCY", "is_active": True},
        {"_id": 1, "short_name": 1},
    ).sort("short_name", 1)
    return [{"id": str(d["_id"]), "short_name": d.get("short_name", "")} for d in docs]


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[SupplierResponse])
async def list_suppliers(
    page:          int              = Query(default=1, ge=1),
    page_size:     int              = Query(default=20, ge=1, le=100),
    search:        str | None       = Query(default=None),
    is_active:     bool | None      = Query(default=None),
    supplier_type: SupplierType | None = Query(default=None),
    sort_by:       str | None       = Query(default="short_name"),
    sort_dir:      str | None       = Query(default="asc"),
    current_user:  dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}
    if is_active is not None:
        filter["is_active"] = is_active
    if supplier_type:
        filter["supplier_type"] = supplier_type
    if search:
        filter.update(build_search_filter(search, ["short_name", "legal_name", "registration_number"]))

    sort_field     = sort_by if sort_by in SUPPLIER_SORT_FIELDS else "short_name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.SUPPLIERS].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.SUPPLIERS]
        .find(filter)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[SupplierResponse](
        data=[SupplierResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Export CSV — must appear BEFORE /{supplier_id} ───────────────────────────

@router.get("/export")
async def export_suppliers(
    search:        str | None       = Query(default=None),
    is_active:     bool | None      = Query(default=None),
    supplier_type: SupplierType | None = Query(default=None),
    current_user:  dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}
    if is_active is not None:
        filter["is_active"] = is_active
    if supplier_type:
        filter["supplier_type"] = supplier_type
    if search:
        filter.update(build_search_filter(search, ["short_name", "legal_name", "registration_number"]))

    docs   = db[Collections.SUPPLIERS].find(filter).sort("short_name", 1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Short Name", "Legal Name", "Type", "Registration Number", "Channels", "Status"])
    for doc in docs:
        d = doc_to_dict(doc)
        channels_count = (
            len(d.get("agency_channels", [])) if d.get("supplier_type") == "AGENCY"
            else len(d.get("distributor_channels", []))
        )
        writer.writerow([
            d.get("short_name", ""),
            d.get("legal_name", ""),
            d.get("supplier_type", ""),
            d.get("registration_number", ""),
            channels_count,
            "Active" if d.get("is_active") else "Inactive",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=suppliers_export.csv"},
    )


# ── Import template — must appear BEFORE /{supplier_id} ──────────────────────

@router.get("/import/template")
async def get_import_template(current_user: dict = Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["short_name", "legal_name", "supplier_type", "registration_number"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=suppliers_import_template.csv"},
    )


# ── Import CSV — must appear BEFORE /{supplier_id} ───────────────────────────

@router.post("/import")
async def import_suppliers(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db      = get_db()
    content = await file.read()

    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            decoded = content.decode(encoding)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    else:
        raise HTTPException(status_code=400, detail="Could not decode file. Please save the CSV as UTF-8.")

    reader  = csv.DictReader(io.StringIO(decoded))
    created = 0
    updated = 0
    failed  = 0
    errors  = []

    for i, row in enumerate(reader, start=2):
        try:
            short_name    = (row.get("short_name") or "").strip()
            legal_name    = (row.get("legal_name") or "").strip()
            supplier_type = (row.get("supplier_type") or "DISTRIBUTOR").strip().upper()
            reg_number    = (row.get("registration_number") or "").strip() or None

            if not short_name:
                raise ValueError("short_name is required")
            if not legal_name:
                raise ValueError("legal_name is required")
            if supplier_type not in ("AGENCY", "DISTRIBUTOR"):
                supplier_type = "DISTRIBUTOR"

            now      = datetime.now(timezone.utc).isoformat()
            existing = db[Collections.SUPPLIERS].find_one(
                {"short_name": {"$regex": f"^{re.escape(short_name)}$", "$options": "i"}}
            )
            if existing:
                db[Collections.SUPPLIERS].update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "short_name": short_name,
                        "legal_name": legal_name,
                        "registration_number": reg_number,
                        "updated_at": now,
                    }},
                )
                updated += 1
            else:
                supplier_id = new_id()
                channels_field = "agency_channels" if supplier_type == "AGENCY" else "distributor_channels"
                data = {
                    "_id":                  supplier_id,
                    "supplier_type":        supplier_type,
                    "short_name":           short_name,
                    "legal_name":           legal_name,
                    "registration_number":  reg_number,
                    "agency_channels":      [],
                    "distributor_channels": [],
                    "expiry_alert_configs": [],
                    "is_active":            True,
                    "created_at":           now,
                    "updated_at":           now,
                    **audit_create_fields(current_user),
                }
                db[Collections.SUPPLIERS].insert_one(data)
                created += 1
        except Exception as e:
            failed += 1
            errors.append({"row": i, "message": str(e)})

    return {"created": created, "updated": updated, "failed": failed, "errors": errors}


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    payload:      SupplierCreate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    data = payload.model_dump()
    if data.get("supplier_type") == "DISTRIBUTOR":
        _denormalize_agency_names(db, data.get("distributor_channels", []))

    supplier_id = new_id()
    doc = {
        "_id": supplier_id,
        **data,
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.SUPPLIERS].insert_one(doc)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="supplier", resource_id=supplier_id,
    )
    return SupplierResponse(**doc_to_dict(doc))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id:  str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SUPPLIERS].find_one({"_id": supplier_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierResponse(**doc_to_dict(doc))


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id:  str,
    payload:      SupplierUpdate,
    current_user: dict = Depends(require_min_role("MANAGER")),
):
    db  = get_db()
    doc = db[Collections.SUPPLIERS].find_one({"_id": supplier_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Supplier not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}

    if "distributor_channels" in updates:
        _denormalize_agency_names(db, updates["distributor_channels"])

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.SUPPLIERS].update_one({"_id": supplier_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="supplier", resource_id=supplier_id,
    )
    updated = db[Collections.SUPPLIERS].find_one({"_id": supplier_id})
    return SupplierResponse(**doc_to_dict(updated))
