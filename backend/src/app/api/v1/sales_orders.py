from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timedelta, timezone
import csv, io
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.sale_order import (
    SalesOrderCreate, SalesOrderUpdate, SalesOrderResponse,
    ConvertToInvoiceRequest, QuotationPdfRequest,
)
from app.models.sale import SaleCreate, SaleItem, SaleResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/sales/orders", tags=["Sales"])

BRANCH_LEVEL_ROLES      = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}
SALES_ORDER_SORT_FIELDS = {"created_at", "updated_at", "total_amount", "status", "customer_name"}


def _apply_branch_scope(flt: dict, current_user: dict, branch_id: str | None) -> None:
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        flt["branch_id"] = current_user["branch_id"]
    elif branch_id:
        flt["branch_id"] = branch_id


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[SalesOrderResponse])
async def list_sales_orders(
    branch_id:    str | None = Query(default=None),
    status:       str | None = Query(default=None),
    customer_id:  str | None = Query(default=None),
    search:       str | None = Query(default=None),
    page:         int        = Query(default=1, ge=1),
    page_size:    int        = Query(default=20, ge=1, le=100),
    sort_by:      str | None = Query(default="created_at"),
    sort_dir:     str | None = Query(default="desc"),
    current_user: dict       = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    _apply_branch_scope(flt, current_user, branch_id)
    if status:      flt["status"]      = status
    if customer_id: flt["customer_id"] = customer_id
    if search:      flt.update(build_search_filter(search, ["customer_name"]))

    sort_field     = sort_by if sort_by in SALES_ORDER_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.SALES_ORDERS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.SALES_ORDERS]
        .find(flt)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[SalesOrderResponse](
        data=[SalesOrderResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_sales_orders(
    branch_id:    str | None = Query(default=None),
    status:       str | None = Query(default=None),
    search:       str | None = Query(default=None),
    current_user: dict       = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    _apply_branch_scope(flt, current_user, branch_id)
    if status: flt["status"] = status
    if search: flt.update(build_search_filter(search, ["customer_name"]))

    docs   = db[Collections.SALES_ORDERS].find(flt).sort("created_at", -1)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Order ID", "Customer", "Items", "Total", "Status", "Created At"])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d["id"],
            d.get("customer_name", "") or "Walk-in",
            len(d.get("items", [])),
            f"{d.get('total_amount', 0):.2f}",
            d.get("status", ""),
            d.get("created_at", "")[:10],
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sales_orders_export.csv"},
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=SalesOrderResponse, status_code=201)
async def create_sales_order(
    payload:      SalesOrderCreate,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

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
        items_data.append({**item.model_dump(), "product_name": product_name, "total_price": item_total})

    total_amount = subtotal - discount_total
    doc_id       = new_id()
    data = {
        "_id":            doc_id,
        **payload.model_dump(exclude={"items"}),
        "customer_name":  customer_name,
        "items":          items_data,
        "subtotal":       subtotal,
        "discount_total": discount_total,
        "total_amount":   total_amount,
        "status":         "DRAFT",
        "created_by":     current_user["id"],
        "created_by_name": current_user.get("full_name", ""),
        "created_at":     now,
        "updated_at":     now,
        **audit_create_fields(current_user),
    }
    db[Collections.SALES_ORDERS].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="sales_order", resource_id=doc_id,
    )
    return SalesOrderResponse(**doc_to_dict(data))


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{order_id}", response_model=SalesOrderResponse)
async def get_sales_order(
    order_id:     str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sales order not found")
    return SalesOrderResponse(**doc_to_dict(doc))


# ── Update (DRAFT only) ───────────────────────────────────────────────────────

@router.patch("/{order_id}", response_model=SalesOrderResponse)
async def update_sales_order(
    order_id:     str,
    payload:      SalesOrderUpdate,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sales order not found")
    if doc["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT orders can be edited")

    updates = payload.model_dump(exclude_unset=True)

    if "items" in updates and updates["items"] is not None:
        items_data     = []
        subtotal       = 0.0
        discount_total = 0.0
        for item in updates["items"]:
            item_dict  = item if isinstance(item, dict) else item.model_dump()
            item_total = (item_dict["unit_price"] * item_dict["quantity"]) - item_dict.get("discount", 0)
            subtotal       += item_dict["unit_price"] * item_dict["quantity"]
            discount_total += item_dict.get("discount", 0)
            items_data.append({**item_dict, "total_price": item_total})
        updates["items"]          = items_data
        updates["subtotal"]       = subtotal
        updates["discount_total"] = discount_total
        updates["total_amount"]   = subtotal - discount_total

    if "customer_id" in updates and updates["customer_id"]:
        customer = db[Collections.CUSTOMERS].find_one({"_id": updates["customer_id"]})
        if customer:
            updates["customer_name"] = customer.get("full_name", "")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.SALES_ORDERS].update_one({"_id": order_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="sales_order", resource_id=order_id,
    )
    return SalesOrderResponse(**doc_to_dict(db[Collections.SALES_ORDERS].find_one({"_id": order_id})))


# ── Confirm ───────────────────────────────────────────────────────────────────

@router.post("/{order_id}/confirm", response_model=SalesOrderResponse)
async def confirm_sales_order(
    order_id:     str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sales order not found")
    if doc["status"] != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT orders can be confirmed")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.SALES_ORDERS].update_one(
        {"_id": order_id},
        {"$set": {"status": "CONFIRMED", "confirmed_at": now, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CONFIRM",
        resource="sales_order", resource_id=order_id,
    )
    return SalesOrderResponse(**doc_to_dict(db[Collections.SALES_ORDERS].find_one({"_id": order_id})))


# ── Cancel ────────────────────────────────────────────────────────────────────

@router.post("/{order_id}/cancel", response_model=SalesOrderResponse)
async def cancel_sales_order(
    order_id:     str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sales order not found")
    if doc["status"] in ("INVOICED", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Cannot cancel an INVOICED or already CANCELLED order")

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.SALES_ORDERS].update_one(
        {"_id": order_id},
        {"$set": {"status": "CANCELLED", "cancelled_at": now, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CANCEL",
        resource="sales_order", resource_id=order_id,
    )
    return SalesOrderResponse(**doc_to_dict(db[Collections.SALES_ORDERS].find_one({"_id": order_id})))


# ── Convert to Invoice ────────────────────────────────────────────────────────

@router.post("/{order_id}/convert", response_model=SaleResponse)
async def convert_to_invoice(
    order_id:     str,
    payload:      ConvertToInvoiceRequest,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sales order not found")
    if doc["status"] != "CONFIRMED":
        raise HTTPException(status_code=400, detail="Only CONFIRMED orders can be converted to an invoice")

    now           = datetime.now(timezone.utc).isoformat()
    order         = doc_to_dict(doc)
    branch_id     = order["branch_id"]
    customer_name = order.get("customer_name", "")

    items_data     = []
    subtotal       = 0.0
    discount_total = 0.0

    for order_item in order.get("items", []):
        product_id  = order_item["product_id"]
        quantity    = order_item["quantity"]
        unit_price  = order_item["unit_price"]
        discount    = order_item.get("discount", 0)

        # Auto-select first available batch with enough stock
        inv_doc = db[Collections.INVENTORY].find_one({
            "product_id": product_id,
            "branch_id":  branch_id,
        })
        if not inv_doc:
            raise HTTPException(
                status_code=400,
                detail=f"No inventory found for product {order_item.get('product_name', product_id)}",
            )

        batch_number = ""
        batches      = inv_doc.get("batches", [])
        for batch in batches:
            if batch.get("quantity", 0) >= quantity:
                batch_number = batch["batch_number"]
                break

        if not batch_number:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {order_item.get('product_name', product_id)}",
            )

        item_total      = (unit_price * quantity) - discount
        subtotal       += unit_price * quantity
        discount_total += discount
        items_data.append({
            "product_id":      product_id,
            "product_name":    order_item.get("product_name", ""),
            "batch_number":    batch_number,
            "quantity":        quantity,
            "unit_price":      unit_price,
            "discount":        discount,
            "total_price":     item_total,
            "prescription_id": order_item.get("prescription_id"),
        })

    total_amount  = subtotal - discount_total
    change_amount = max(0.0, payload.paid_amount - total_amount)
    sale_id       = new_id()

    sale_data = {
        "_id":            sale_id,
        "branch_id":      branch_id,
        "customer_id":    order.get("customer_id"),
        "customer_name":  customer_name,
        "items":          items_data,
        "payment_method": payload.payment_method,
        "cheque_details": payload.cheque_details.model_dump() if payload.cheque_details else None,
        "paid_amount":    payload.paid_amount,
        "source":         "ORDER",
        "sales_order_id": order_id,
        "subtotal":       subtotal,
        "discount_total": discount_total,
        "total_amount":   total_amount,
        "change_amount":  change_amount,
        "refund_amount":  0,
        "status":         "COMPLETED",
        "cashier_id":     current_user["id"],
        "cashier_name":   current_user.get("full_name", ""),
        "created_at":     payload.invoice_date + "T00:00:00+00:00" if "T" not in payload.invoice_date else payload.invoice_date,
        "updated_at":     now,
    }
    db[Collections.SALES].insert_one(sale_data)

    # Deduct inventory stock
    for item in items_data:
        inv_doc = db[Collections.INVENTORY].find_one({
            "product_id": item["product_id"],
            "branch_id":  branch_id,
        })
        if inv_doc:
            batches = inv_doc.get("batches", [])
            for batch in batches:
                if batch["batch_number"] == item["batch_number"]:
                    batch["quantity"] = max(0, batch["quantity"] - item["quantity"])
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

    # Credit sales: update customer balance
    if payload.payment_method == "CREDIT" and order.get("customer_id"):
        db[Collections.CUSTOMERS].update_one(
            {"_id": order["customer_id"]},
            {"$inc": {"outstanding_balance": total_amount}}
        )

    # Mark order as INVOICED
    db[Collections.SALES_ORDERS].update_one(
        {"_id": order_id},
        {"$set": {"status": "INVOICED", "invoiced_at": now, "sale_id": sale_id, "updated_at": now}},
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CONVERT_TO_INVOICE",
        resource="sales_order", resource_id=order_id,
    )

    return SaleResponse(**doc_to_dict(sale_data))


# ── Quotation PDF ─────────────────────────────────────────────────────────────

def _build_quotation_pdf(order: dict, validity_days: int, notes: str | None) -> io.BytesIO:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.colors import HexColor, white, black
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
    )
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT

    PRIMARY    = HexColor("#2563EB")
    LIGHT_BG   = HexColor("#EFF6FF")
    HEADER_BG  = HexColor("#1E3A5F")
    MUTED      = HexColor("#64748B")
    ALT_ROW    = HexColor("#F8FAFC")
    BORDER     = HexColor("#E2E8F0")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=20*mm, leftMargin=20*mm,
        topMargin=18*mm, bottomMargin=18*mm,
    )
    W = A4[0] - 40*mm

    def style(name, **kw):
        base = ParagraphStyle(name, fontName="Helvetica", fontSize=10, leading=14, **kw)
        return base

    title_style   = style("title",   fontName="Helvetica-Bold", fontSize=22, textColor=PRIMARY)
    org_style     = style("org",     fontName="Helvetica-Bold", fontSize=14, textColor=HEADER_BG)
    sub_style     = style("sub",     fontSize=9, textColor=MUTED)
    label_style   = style("label",   fontSize=8,  textColor=MUTED, fontName="Helvetica-Bold")
    value_style   = style("value",   fontSize=10, textColor=black, fontName="Helvetica-Bold")
    body_style    = style("body",    fontSize=9,  textColor=black)
    notes_style   = style("notes",   fontSize=9,  textColor=MUTED, leading=13)
    right_style   = style("right",   fontSize=9,  textColor=MUTED, alignment=TA_RIGHT)
    footer_style  = style("footer",  fontSize=8,  textColor=MUTED, alignment=TA_CENTER)

    # ── Dates ──────────────────────────────────────────────────────────────────
    created_raw = order.get("created_at", "")
    try:
        order_date = datetime.fromisoformat(created_raw.replace("Z", "+00:00")).date()
    except Exception:
        order_date = datetime.now(timezone.utc).date()
    valid_until = order_date + timedelta(days=validity_days)
    order_ref   = order["id"][-8:].upper()

    flowables = []

    # ── Header ─────────────────────────────────────────────────────────────────
    header_data = [[
        [Paragraph("Medi Guide Pharmacy", org_style),
         Paragraph("Multi-Branch Pharmacy Management", sub_style)],
        Paragraph("QUOTATION", title_style),
    ]]
    header_table = Table(header_data, colWidths=[W * 0.6, W * 0.4])
    header_table.setStyle(TableStyle([
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",       (1, 0), (1, 0),   "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flowables.append(header_table)
    flowables.append(HRFlowable(width=W, thickness=1.5, color=PRIMARY, spaceAfter=10))

    # ── Info row ───────────────────────────────────────────────────────────────
    info_data = [[
        [Paragraph("QUOTATION #", label_style), Paragraph(order_ref, value_style)],
        [Paragraph("DATE", label_style),        Paragraph(str(order_date), value_style)],
        [Paragraph("VALID UNTIL", label_style), Paragraph(str(valid_until), value_style)],
        [Paragraph("BILL TO", label_style),     Paragraph(order.get("customer_name") or "Walk-in", value_style)],
    ]]
    col_w = W / 4
    info_table = Table(info_data, colWidths=[col_w] * 4)
    info_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_BG),
        ("ROUNDEDCORNERS", (0, 0), (-1, -1), [4, 4, 4, 4]),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("LINEAFTER",     (0, 0), (2, 0),   0.5, BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    flowables.append(info_table)
    flowables.append(Spacer(1, 10))

    # ── Items table ────────────────────────────────────────────────────────────
    col_widths = [W * 0.04, W * 0.40, W * 0.08, W * 0.14, W * 0.14, W * 0.20]
    tbl_header = ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9, textColor=white)
    rows = [[
        Paragraph("#", tbl_header),
        Paragraph("Product", tbl_header),
        Paragraph("Qty", tbl_header),
        Paragraph("Unit Price", tbl_header),
        Paragraph("Discount", tbl_header),
        Paragraph("Total", tbl_header),
    ]]
    for i, item in enumerate(order.get("items", []), 1):
        qty        = item.get("quantity", 0)
        unit_price = item.get("unit_price", 0)
        discount   = item.get("discount", 0)
        total      = qty * unit_price - discount
        rows.append([
            Paragraph(str(i), body_style),
            Paragraph(item.get("product_name", ""), body_style),
            Paragraph(str(qty), body_style),
            Paragraph(f"{unit_price:.2f}", body_style),
            Paragraph(f"{discount:.2f}", body_style),
            Paragraph(f"LKR {total:.2f}", body_style),
        ])

    subtotal       = order.get("subtotal", 0)
    discount_total = order.get("discount_total", 0)
    total_amount   = order.get("total_amount", 0)
    total_bold     = ParagraphStyle("tb", fontName="Helvetica-Bold", fontSize=10, textColor=PRIMARY)

    rows.append(["", "", "", "", Paragraph("Subtotal",       right_style), Paragraph(f"LKR {subtotal:.2f}", body_style)])
    rows.append(["", "", "", "", Paragraph("Discount",       right_style), Paragraph(f"LKR {discount_total:.2f}", body_style)])
    rows.append(["", "", "", "", Paragraph("Grand Total",    total_bold),  Paragraph(f"LKR {total_amount:.2f}", total_bold)])

    n_data = len(rows)
    items_table = Table(rows, colWidths=col_widths, repeatRows=1)
    items_style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),       HEADER_BG),
        ("VALIGN",        (0, 0), (-1, -1),       "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1),       6),
        ("BOTTOMPADDING", (0, 0), (-1, -1),       6),
        ("LEFTPADDING",   (0, 0), (-1, -1),       8),
        ("RIGHTPADDING",  (0, 0), (-1, -1),       8),
        ("ROWBACKGROUNDS", (0, 1), (-1, n_data - 4), [white, ALT_ROW]),
        ("LINEBELOW",     (0, 0), (-1, n_data - 4), 0.5, BORDER),
        ("LINEABOVE",     (0, n_data - 3), (-1, n_data - 3), 1, BORDER),
        ("LINEABOVE",     (0, n_data - 1), (-1, n_data - 1), 1.5, PRIMARY),
        ("SPAN",          (0, n_data - 3), (3, n_data - 3)),
        ("SPAN",          (0, n_data - 2), (3, n_data - 2)),
        ("SPAN",          (0, n_data - 1), (3, n_data - 1)),
    ])
    items_table.setStyle(items_style)
    flowables.append(items_table)

    # ── Notes ──────────────────────────────────────────────────────────────────
    if notes and notes.strip():
        flowables.append(Spacer(1, 10))
        flowables.append(Paragraph("Notes", style("notes_hdr", fontName="Helvetica-Bold", fontSize=9, textColor=MUTED)))
        flowables.append(Spacer(1, 3))
        flowables.append(Paragraph(notes.strip(), notes_style))

    # ── Footer ─────────────────────────────────────────────────────────────────
    flowables.append(Spacer(1, 16))
    flowables.append(HRFlowable(width=W, thickness=0.5, color=BORDER))
    flowables.append(Spacer(1, 4))
    flowables.append(Paragraph("This is a computer-generated quotation and does not require a signature.", footer_style))

    doc.build(flowables)
    buf.seek(0)
    return buf


@router.post("/{order_id}/quotation-pdf")
async def export_quotation_pdf(
    order_id:     str,
    payload:      QuotationPdfRequest,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.SALES_ORDERS].find_one({"_id": order_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sales order not found")
    if doc["status"] not in ("DRAFT", "CONFIRMED"):
        raise HTTPException(status_code=400, detail="Only DRAFT or CONFIRMED orders can be exported as a quotation")

    order      = doc_to_dict(doc)
    pdf_buffer = _build_quotation_pdf(order, payload.validity_days, payload.notes)
    order_ref  = order_id[-8:].upper()

    return StreamingResponse(
        iter([pdf_buffer.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="quotation-{order_ref}.pdf"'},
    )
