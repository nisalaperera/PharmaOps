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

SUPPLIER_SORT_FIELDS = {"name", "legal_name", "created_at"}


def _denormalize_agency_names(db, distributor_channels: list) -> list:
    for ch in distributor_channels:
        if isinstance(ch, dict):
            if ch.get("channel_category") == "AGENCY" and ch.get("agency_id"):
                agency_doc = db[Collections.SUPPLIERS].find_one({"_id": ch["agency_id"]})
                if agency_doc:
                    ch["agency_name"] = agency_doc.get("name", agency_doc.get("short_name", ""))
        else:
            if ch.channel_category == "AGENCY" and ch.agency_id:
                agency_doc = db[Collections.SUPPLIERS].find_one({"_id": ch.agency_id})
                if agency_doc:
                    ch.agency_name = agency_doc.get("name", agency_doc.get("short_name", ""))
    return distributor_channels


@router.get("/agencies")
async def list_agencies(
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    docs = db[Collections.SUPPLIERS].find(
        {"supplier_type": "AGENCY", "is_active": True},
        {"_id": 1, "name": 1, "short_name": 1},
    ).sort("name", 1)
    return [{"id": str(d["_id"]), "name": d.get("name", d.get("short_name", ""))} for d in docs]


@router.get("", response_model=PaginatedResponse[SupplierResponse])
async def list_suppliers(
    page:          int              = Query(default=1, ge=1),
    page_size:     int              = Query(default=20, ge=1, le=500),
    search:        str | None       = Query(default=None),
    is_active:     bool | None      = Query(default=None),
    supplier_type: SupplierType | None = Query(default=None),
    sort_by:       str | None       = Query(default="name"),
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
        filter.update(build_search_filter(search, ["name", "short_name", "legal_name", "registration_number"]))

    sort_field     = sort_by if sort_by in SUPPLIER_SORT_FIELDS else "name"
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
        filter.update(build_search_filter(search, ["name", "short_name", "legal_name", "registration_number"]))

    docs   = db[Collections.SUPPLIERS].find(filter).sort("name", 1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Legal Name", "Type", "Registration Number", "Credit Term Days", "Credit Limit", "Channels", "Status"])
    for doc in docs:
        d = doc_to_dict(doc)
        channels_count = (
            len(d.get("agency_channels", [])) if d.get("supplier_type") == "AGENCY"
            else len(d.get("distributor_channels", []))
        )
        writer.writerow([
            d.get("name", d.get("short_name", "")),
            d.get("legal_name", ""),
            d.get("supplier_type", ""),
            d.get("registration_number", ""),
            d.get("credit_term_days", 30),
            d.get("credit_limit") or "",
            channels_count,
            "Active" if d.get("is_active") else "Inactive",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=suppliers_export.csv"},
    )


@router.get("/import/template")
async def get_import_template(current_user: dict = Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "legal_name", "supplier_type", "registration_number", "credit_term_days", "credit_limit"])
    writer.writerow(["ABC Pharma", "ABC Pharmaceuticals Ltd", "DISTRIBUTOR", "REG-001", "30", "500000"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=suppliers_import_template.csv"},
    )


@router.post("/import")
async def import_suppliers(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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
            name          = (row.get("name") or row.get("short_name") or "").strip()
            legal_name    = (row.get("legal_name") or "").strip()
            supplier_type = (row.get("supplier_type") or "DISTRIBUTOR").strip().upper()
            reg_number    = (row.get("registration_number") or "").strip() or None
            credit_raw    = (row.get("credit_term_days") or "").strip()
            credit_term   = int(credit_raw) if credit_raw.isdigit() else 30
            limit_raw     = (row.get("credit_limit") or "").strip()
            credit_limit  = float(limit_raw) if limit_raw else None

            if not name:
                raise ValueError("name is required")
            if not legal_name:
                raise ValueError("legal_name is required")
            if supplier_type not in ("AGENCY", "DISTRIBUTOR"):
                supplier_type = "DISTRIBUTOR"

            now      = datetime.now(timezone.utc).isoformat()
            existing = db[Collections.SUPPLIERS].find_one({
                "$or": [
                    {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
                    {"short_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
                ]
            })
            if existing:
                db[Collections.SUPPLIERS].update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "name": name,
                        "legal_name": legal_name,
                        "registration_number": reg_number,
                        "credit_term_days": credit_term,
                        "credit_limit": credit_limit,
                        "updated_at": now,
                        **audit_update_fields(current_user),
                    }},
                )
                updated += 1
            else:
                supplier_id = new_id()
                data = {
                    "_id":                  supplier_id,
                    "supplier_type":        supplier_type,
                    "name":                 name,
                    "legal_name":           legal_name,
                    "registration_number":  reg_number,
                    "contacts":             [],
                    "credit_term_days":     credit_term,
                    "credit_limit":         credit_limit,
                    "outstanding_balance":  0,
                    "notes":                None,
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


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    payload:      SupplierCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id:  str,
    payload:      SupplierUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
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
