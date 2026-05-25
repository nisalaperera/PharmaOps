from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.sale import SaleCreate, SaleUpdate, SaleResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/sales/invoices", tags=["Sales"])

SALE_SORT_FIELDS = {"created_at", "total_amount", "customer_name"}
BRANCH_LEVEL_ROLES = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}


def _apply_branch_scope(flt: dict, current_user: dict, branch_id: str | None) -> None:
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        flt["branch_id"] = current_user["branch_id"]
    elif branch_id:
        flt["branch_id"] = branch_id


# ── Export (before /{sale_id}) ────────────────────────────────────────────────

@router.get("/export")
async def export_sales(
    branch_id:      str | None = Query(default=None),
    customer_id:    str | None = Query(default=None),
    search:         str | None = Query(default=None),
    status:         str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    start_date:     str | None = Query(default=None),
    end_date:       str | None = Query(default=None),
    current_user:   dict       = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    _apply_branch_scope(flt, current_user, branch_id)
    if customer_id:    flt["customer_id"]    = customer_id
    if status:         flt["status"]          = status
    if payment_method: flt["payment_method"]  = payment_method
    if start_date or end_date:
        date_filter: dict = {}
        if start_date: date_filter["$gte"] = start_date
        if end_date:   date_filter["$lte"] = end_date + "T23:59:59"
        flt["created_at"] = date_filter
    if search:
        flt.update(build_search_filter(search, ["customer_name", "cashier_name"]))

    docs   = db[Collections.SALES].find(flt).sort("created_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Customer", "Cashier", "Items", "Subtotal", "Discount", "Total", "Payment", "Status"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("created_at", "")[:10],
            d.get("customer_name", "") or "Walk-in",
            d.get("cashier_name", ""),
            len(d.get("items", [])),
            f"{d.get('subtotal', 0):.2f}",
            f"{d.get('discount_total', 0):.2f}",
            f"{d.get('total_amount', 0):.2f}",
            d.get("payment_method", ""),
            d.get("status", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sales_export.csv"},
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[SaleResponse])
async def list_sales(
    branch_id:      str | None = Query(default=None),
    customer_id:    str | None = Query(default=None),
    search:         str | None = Query(default=None),
    status:         str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    start_date:     str | None = Query(default=None),
    end_date:       str | None = Query(default=None),
    page:           int        = Query(default=1, ge=1),
    page_size:      int        = Query(default=20, ge=1, le=100),
    sort_by:        str | None = Query(default="created_at"),
    sort_dir:       str | None = Query(default="desc"),
    current_user:   dict       = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    _apply_branch_scope(flt, current_user, branch_id)
    if customer_id:    flt["customer_id"]    = customer_id
    if status:         flt["status"]          = status
    if payment_method: flt["payment_method"]  = payment_method
    if start_date or end_date:
        date_filter: dict = {}
        if start_date: date_filter["$gte"] = start_date
        if end_date:   date_filter["$lte"] = end_date + "T23:59:59"
        flt["created_at"] = date_filter
    if search:
        flt.update(build_search_filter(search, ["customer_name", "cashier_name"]))

    sort_field     = sort_by if sort_by in SALE_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.SALES].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.SALES].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size)

    return PaginatedResponse[SaleResponse](
        data=[SaleResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=SaleResponse, status_code=201)
async def create_sale(payload: SaleCreate, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # Resolve customer name
    customer_name = ""
    if payload.customer_id:
        customer = db[Collections.CUSTOMERS].find_one({"_id": payload.customer_id})
        if customer:
            customer_name = customer.get("full_name", "")

    items_data     = []
    subtotal       = 0.0
    discount_total = 0.0

    for item in payload.items:
        product_name = item.product_name
        if not product_name and item.product_id:
            product = db[Collections.PRODUCTS].find_one({"_id": item.product_id})
            if product:
                product_name = product.get("name", "")

        item_total      = (item.unit_price * item.quantity) - item.discount
        subtotal       += item.unit_price * item.quantity
        discount_total += item.discount
        items_data.append({
            **item.model_dump(),
            "product_name": product_name,
            "total_price":  item_total,
        })

    total_amount  = subtotal - discount_total
    change_amount = max(0.0, payload.paid_amount - total_amount)
    doc_id        = new_id()

    sale_data = {
        "_id":            doc_id,
        **payload.model_dump(exclude={"items"}),
        "customer_name":  customer_name,
        "items":          items_data,
        "subtotal":       subtotal,
        "discount_total": discount_total,
        "total_amount":   total_amount,
        "change_amount":  change_amount,
        "status":         "COMPLETED",
        "cashier_id":     current_user["id"],
        "cashier_name":   current_user.get("full_name", ""),
        "created_at":     now,
        "updated_at":     now,
        **audit_create_fields(current_user),
    }
    db[Collections.SALES].insert_one(sale_data)

    # Deduct inventory stock
    for item in payload.items:
        inv_doc = db[Collections.INVENTORY].find_one({
            "product_id": item.product_id,
            "branch_id":  payload.branch_id,
        })
        if inv_doc:
            batches = inv_doc.get("batches", [])
            for batch in batches:
                if batch["batch_number"] == item.batch_number:
                    batch["quantity"] = max(0, batch["quantity"] - item.quantity)
            total_qty = sum(b["quantity"] for b in batches)
            min_level = inv_doc.get("min_stock_level", 0)
            db[Collections.INVENTORY].update_one(
                {"_id": inv_doc["_id"]},
                {"$set": {
                    "batches":        batches,
                    "total_quantity": total_qty,
                    "is_low_stock":   total_qty <= min_level,
                    "updated_at":     now,
                }}
            )

    # Credit sales: add to customer outstanding balance
    if payload.payment_method == "CREDIT" and payload.customer_id:
        db[Collections.CUSTOMERS].update_one(
            {"_id": payload.customer_id},
            {"$inc": {"outstanding_balance": total_amount}}
        )

    # Increment prescription usage count
    if payload.items:
        used_rx_ids = {item.prescription_id for item in payload.items if item.prescription_id}
        for rx_id in used_rx_ids:
            db[Collections.PRESCRIPTIONS].update_one(
                {"_id": rx_id},
                {"$inc": {"usage_count": 1}}
            )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="sale", resource_id=doc_id,
    )

    return SaleResponse(**doc_to_dict(sale_data))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(sale_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.SALES].find_one({"_id": sale_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sale not found")
    return SaleResponse(**doc_to_dict(doc))


# ── Update (refund) ───────────────────────────────────────────────────────────

@router.patch("/{sale_id}", response_model=SaleResponse)
async def update_sale(
    sale_id: str,
    payload: SaleUpdate,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SALES].find_one({"_id": sale_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sale not found")

    sale    = doc_to_dict(doc)
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.SALES].update_one({"_id": sale_id}, {"$set": updates})

    # For CREDIT sales being refunded, restore customer balance
    if payload.status in ("REFUNDED", "PARTIAL_REFUND"):
        customer_id    = sale.get("customer_id")
        payment_method = sale.get("payment_method")
        if customer_id and payment_method == "CREDIT":
            refund_amt = payload.refund_amount if payload.refund_amount else sale.get("total_amount", 0)
            db[Collections.CUSTOMERS].update_one(
                {"_id": customer_id},
                {"$inc": {"outstanding_balance": -refund_amt}}
            )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="sale", resource_id=sale_id,
    )

    updated = db[Collections.SALES].find_one({"_id": sale_id})
    return SaleResponse(**doc_to_dict(updated))
