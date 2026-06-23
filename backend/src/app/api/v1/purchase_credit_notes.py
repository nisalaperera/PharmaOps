from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, date
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.branch_scope import apply_branch_filter, enforce_branch_on_create
from app.utils.sequences import generate_document_number, get_branch_code
from app.models.purchase_credit_note import (
    PurchaseCreditNoteCreate, PurchaseCreditNoteUpdate, PurchaseCreditNoteResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/purchases/credit-notes", tags=["Purchases"])

SORT_FIELDS = {"created_at", "credit_note_date", "total_amount", "status"}


def _resolve_names(db, doc: dict) -> dict:
    d = doc_to_dict(doc) if "_id" in doc else dict(doc)
    supplier = db[Collections.SUPPLIERS].find_one({"_id": d.get("supplier_id")}, {"name": 1, "short_name": 1})
    if supplier:
        d["supplier_name"] = supplier.get("name", supplier.get("short_name", ""))
    if d.get("supplier_id") and d.get("channel_id"):
        sup = db[Collections.SUPPLIERS].find_one({"_id": d["supplier_id"]})
        if sup:
            for ch_list in ("agency_channels", "distributor_channels"):
                for ch in sup.get(ch_list, []):
                    if ch.get("id") == d["channel_id"]:
                        d["channel_name"] = ch.get("channel_name", "")
                        break
    return d


def _compute_items(db, items: list[dict]) -> tuple[list[dict], float]:
    total = 0.0
    today = date.today()
    for item in items:
        item["line_total"] = round(item.get("quantity", 0) * item.get("unit_price", 0), 2)
        total += item["line_total"]

        product = db[Collections.PRODUCTS].find_one({"_id": item.get("product_id")}, {"brand_id": 1, "name": 1})
        if product:
            item["product_name"] = product.get("name", item.get("product_name", ""))
            brand = db[Collections.BRANDS].find_one({"_id": product.get("brand_id")}, {"return_expiry_before": 1})
            if brand and brand.get("return_expiry_before") is not None:
                policy_days = brand["return_expiry_before"]
                expiry_str = item.get("expiry_date", "")
                if expiry_str:
                    try:
                        expiry = date.fromisoformat(expiry_str)
                        days_until_expiry = (expiry - today).days
                        if days_until_expiry < policy_days:
                            item["return_policy_warning"] = (
                                f"Outside return window: {days_until_expiry} days to expiry, "
                                f"policy requires {policy_days}+ days"
                            )
                    except ValueError:
                        pass

    return items, round(total, 2)


@router.get("", response_model=PaginatedResponse[PurchaseCreditNoteResponse])
async def list_credit_notes(
    branch_id:   str | None = Query(default=None),
    supplier_id: str | None = Query(default=None),
    status:      str | None = Query(default=None),
    page:        int = Query(default=1, ge=1),
    page_size:   int = Query(default=20, ge=1, le=100),
    sort_by:     str | None = Query(default="created_at"),
    sort_dir:    str | None = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    apply_branch_filter(flt, current_user, branch_id)
    if supplier_id:
        flt["supplier_id"] = supplier_id
    if status:
        flt["status"] = status

    sort_field = sort_by if sort_by in SORT_FIELDS else "created_at"
    sort_order = 1 if sort_dir == "asc" else -1
    total = db[Collections.PURCHASE_CREDIT_NOTES].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.PURCHASE_CREDIT_NOTES].find(flt).sort(sort_field, sort_order).skip(skip).limit(page_size)
    items = [PurchaseCreditNoteResponse(**_resolve_names(db, d)) for d in docs]

    return PaginatedResponse[PurchaseCreditNoteResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=PurchaseCreditNoteResponse, status_code=201)
async def create_credit_note(
    payload:      PurchaseCreditNoteCreate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    branch_id = enforce_branch_on_create(payload.branch_id, current_user)

    branch_code = get_branch_code(db, branch_id)
    cn_number   = generate_document_number(db, branch_code, "CN")

    items_raw = [i.model_dump() for i in payload.items]
    items, total_amount = _compute_items(db, items_raw)

    doc_id = new_id()
    data = {
        "_id":                doc_id,
        **payload.model_dump(),
        "branch_id":          branch_id,
        "items":              items,
        "credit_note_number": cn_number,
        "total_amount":       total_amount,
        "status":             "DRAFT",
        "applied_payment_id": None,
        "applied_at":         None,
        "inventory_deducted": False,
        "created_at":         now,
        "updated_at":         now,
        **audit_create_fields(current_user),
    }
    _resolve_names(db, data)
    db[Collections.PURCHASE_CREDIT_NOTES].insert_one(data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="purchase_credit_note", resource_id=doc_id,
        branch_id=branch_id,
    )
    return PurchaseCreditNoteResponse(**doc_to_dict(data))


@router.get("/{cn_id}", response_model=PurchaseCreditNoteResponse)
async def get_credit_note(cn_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Credit note not found")
    return PurchaseCreditNoteResponse(**_resolve_names(db, doc))


@router.patch("/{cn_id}", response_model=PurchaseCreditNoteResponse)
async def update_credit_note(
    cn_id:        str,
    payload:      PurchaseCreditNoteUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if doc.get("status") != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT credit notes can be edited")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}

    if "items" in updates:
        updates["items"], updates["total_amount"] = _compute_items(db, updates["items"])

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.PURCHASE_CREDIT_NOTES].update_one({"_id": cn_id}, {"$set": updates})

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="purchase_credit_note", resource_id=cn_id,
    )
    return PurchaseCreditNoteResponse(**_resolve_names(db, db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})))


@router.post("/{cn_id}/approve", response_model=PurchaseCreditNoteResponse)
async def approve_credit_note(
    cn_id:        str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if doc.get("status") != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT credit notes can be approved")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PURCHASE_CREDIT_NOTES].update_one(
        {"_id": cn_id},
        {"$set": {"status": "APPROVED", "updated_at": now, **audit_update_fields(current_user)}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="APPROVE",
        resource="purchase_credit_note", resource_id=cn_id,
    )
    return PurchaseCreditNoteResponse(**_resolve_names(db, db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})))


@router.post("/{cn_id}/cancel", response_model=PurchaseCreditNoteResponse)
async def cancel_credit_note(
    cn_id:        str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if doc.get("status") not in ("DRAFT", "APPROVED"):
        raise HTTPException(status_code=400, detail="Only DRAFT or APPROVED credit notes can be cancelled")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.PURCHASE_CREDIT_NOTES].update_one(
        {"_id": cn_id},
        {"$set": {"status": "CANCELLED", "updated_at": now, **audit_update_fields(current_user)}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CANCEL",
        resource="purchase_credit_note", resource_id=cn_id,
    )
    return PurchaseCreditNoteResponse(**_resolve_names(db, db[Collections.PURCHASE_CREDIT_NOTES].find_one({"_id": cn_id})))
