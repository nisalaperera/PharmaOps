from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/customers", tags=["Customers"])

CUSTOMER_SORT_FIELDS = {"full_name", "phone", "created_at"}


# ── Export (before /{customer_id}) ────────────────────────────────────────────

@router.get("/export")
async def export_customers(
    search:       str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt = build_search_filter(search, ["full_name", "phone", "email"]) if search else {}

    docs   = db[Collections.CUSTOMERS].find(flt).sort("full_name", 1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Full Name", "Phone", "Email", "Date of Birth", "Address", "Credit Limit", "Outstanding Balance"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("full_name", ""),
            d.get("phone", ""),
            d.get("email", ""),
            d.get("date_of_birth", ""),
            d.get("address", ""),
            d.get("credit_limit", 0),
            d.get("outstanding_balance", 0),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customers_export.csv"},
    )


# ── Import template (before /{customer_id}) ───────────────────────────────────

@router.get("/import/template")
async def get_import_template(current_user: dict = Depends(get_current_user)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["full_name", "phone", "email", "date_of_birth", "address", "credit_limit"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customers_import_template.csv"},
    )


# ── Import (before /{customer_id}) ────────────────────────────────────────────

@router.post("/import")
async def import_customers(
    file:         UploadFile = File(...),
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db      = get_db()
    content = await file.read()
    reader  = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    created = 0
    errors  = []

    for i, row in enumerate(reader, start=2):
        try:
            full_name = row.get("full_name", "").strip()
            phone     = row.get("phone", "").strip()
            if not full_name or not phone:
                errors.append({"row": i, "message": "full_name and phone are required"})
                continue

            now    = datetime.now(timezone.utc).isoformat()
            doc_id = new_id()
            data   = {
                "_id":                doc_id,
                "full_name":          full_name,
                "phone":              phone,
                "email":              row.get("email", "").strip() or None,
                "date_of_birth":      row.get("date_of_birth", "").strip() or None,
                "address":            row.get("address", "").strip() or None,
                "credit_limit":       float(row.get("credit_limit", "0") or 0),
                "outstanding_balance": 0.0,
                "is_active":          True,
                "created_at":         now,
                "updated_at":         now,
                **audit_create_fields(current_user),
            }
            db[Collections.CUSTOMERS].insert_one(data)
            created += 1
        except Exception as e:
            errors.append({"row": i, "message": str(e)})

    return {"created": created, "failed": len(errors), "errors": errors}


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[CustomerResponse])
async def list_customers(
    search:    str | None = Query(default=None),
    page:      int        = Query(default=1, ge=1),
    page_size: int        = Query(default=20, ge=1, le=100),
    sort_by:   str | None = Query(default="full_name"),
    sort_dir:  str | None = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt = build_search_filter(search, ["full_name", "phone", "email"]) if search else {}

    sort_field     = sort_by if sort_by in CUSTOMER_SORT_FIELDS else "full_name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.CUSTOMERS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.CUSTOMERS].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size)

    return PaginatedResponse[CustomerResponse](
        data=[CustomerResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    payload:      CustomerCreate,
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    data   = {
        "_id": doc_id,
        **payload.model_dump(),
        "outstanding_balance": 0.0,
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.CUSTOMERS].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="customer", resource_id=doc_id,
    )
    return CustomerResponse(**doc_to_dict(data))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id:  str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.CUSTOMERS].find_one({"_id": customer_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Customer not found")
    return CustomerResponse(**doc_to_dict(doc))


# ── Update ────────────────────────────────────────────────────────────────────

@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id:  str,
    payload:      CustomerUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    if not db[Collections.CUSTOMERS].find_one({"_id": customer_id}):
        raise HTTPException(status_code=404, detail="Customer not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.CUSTOMERS].update_one({"_id": customer_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="customer", resource_id=customer_id,
    )
    return CustomerResponse(**doc_to_dict(db[Collections.CUSTOMERS].find_one({"_id": customer_id})))
