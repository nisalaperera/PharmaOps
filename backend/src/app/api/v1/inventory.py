from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io, re
from app.core.database import get_db, Collections, doc_to_dict, new_id
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.branch_scope import apply_branch_filter, ensure_branch_access, enforce_branch_on_create, BRANCH_LEVEL_ROLES
from app.utils.stock_log import log_stock_movement
from app.models.inventory import (
    InventoryResponse,
    StockInPayload, StockInCreatePayload, BatchStockInPayload,
    StockOutPayload, StockMovementLogResponse,
)
from app.models.common import PaginatedResponse, ImportResult, ImportRowError

router = APIRouter(prefix="/inventory", tags=["Inventory"])

INVENTORY_SORT_FIELDS = {"product_name", "basic_sku_total_quantity"}


def _build_filter(
    current_user: dict,
    branch_id:    str | None,
    search:       str | None,
) -> dict:
    flt: dict = {}
    apply_branch_filter(flt, current_user, branch_id)
    if search: flt["product_name"] = {"$regex": re.escape(search), "$options": "i"}
    return flt


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[InventoryResponse])
async def list_inventory(
    branch_id:    str | None  = Query(default=None),
    search:       str | None  = Query(default=None),
    page:         int         = Query(default=1, ge=1),
    page_size:    int         = Query(default=20, ge=1, le=100),
    sort_by:      str | None  = Query(default="product_name"),
    sort_dir:     str | None  = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt = _build_filter(current_user, branch_id, search)

    sort_field     = sort_by if sort_by in INVENTORY_SORT_FIELDS else "product_name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.INVENTORY].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.INVENTORY].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size)
    items = [InventoryResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[InventoryResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


# ── Export CSV ────────────────────────────────────────────────────────────────
# Must be placed before /{inventory_id} to avoid path-parameter capture.

@router.get("/export")
async def export_inventory(
    branch_id:    str | None  = Query(default=None),
    search:       str | None  = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    flt  = _build_filter(current_user, branch_id, search)
    docs = db[Collections.INVENTORY].find(flt).sort("product_name", 1)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Product Name", "Branch ID", "Basic SKU", "Basic SKU Total Qty", "Updated At",
    ])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("product_name", ""),
            d.get("branch_id", ""),
            d.get("basic_sku", ""),
            d.get("basic_sku_total_quantity", 0),
            d.get("updated_at", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory_export.csv"},
    )


# ── Stock-In Import Template ──────────────────────────────────────────────────
# Must be declared before /{inventory_id} to avoid path-parameter capture.

@router.get("/stock-in/import/template")
async def download_stock_in_import_template(
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "product_name", "batch_number", "expiry_date",
        "quantity", "purchase_price", "selling_price",
        "sku", "supplier_name", "branch_id",
    ])
    # Sample row
    writer.writerow([
        "Paracetamol 500mg", "BATCH-001", "2027-06-01",
        "100", "5.50", "8.00",
        "TAB500", "MedSupply Co.", "",
    ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=stock_in_import_template.csv"},
    )


# ── Stock-In Bulk Import ───────────────────────────────────────────────────────
# Must be declared before /{inventory_id} to avoid path-parameter capture.

REQUIRED_IMPORT_COLUMNS = {"product_name", "batch_number", "expiry_date", "quantity", "purchase_price", "selling_price"}
EXPIRY_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@router.post("/stock-in/import", response_model=ImportResult, status_code=200)
async def import_stock_in(
    file:         UploadFile = File(...),
    current_user: dict       = Depends(require_min_role("BRANCH_MANAGER")),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted.")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # strip BOM if present
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded.")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no header row.")

    headers = {h.strip().lower() for h in reader.fieldnames}
    missing = REQUIRED_IMPORT_COLUMNS - headers
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(sorted(missing))}",
        )

    db       = get_db()
    result   = ImportResult()
    is_branch_user = current_user["role"] in BRANCH_LEVEL_ROLES

    for row_index, raw_row in enumerate(reader, start=2):
        row = {k.strip().lower(): (v or "").strip() for k, v in raw_row.items()}

        def row_error(msg: str):
            result.failed += 1
            result.errors.append(ImportRowError(row=row_index, message=msg))

        # ── Required field validation ──────────────────────────────────────────
        product_name   = row.get("product_name", "")
        batch_number   = row.get("batch_number", "")
        expiry_date    = row.get("expiry_date", "")
        quantity_str   = row.get("quantity", "")
        purchase_str   = row.get("purchase_price", "")
        selling_str    = row.get("selling_price", "")

        if not product_name:
            row_error("product_name is required"); continue
        if not batch_number:
            row_error("batch_number is required"); continue
        if not expiry_date:
            row_error("expiry_date is required"); continue
        if not EXPIRY_DATE_RE.match(expiry_date):
            row_error("expiry_date must be in yyyy-MM-dd format"); continue

        try:
            quantity = int(quantity_str)
            if quantity < 1:
                raise ValueError
        except ValueError:
            row_error("quantity must be a positive integer"); continue

        try:
            purchase_price = float(purchase_str)
            if purchase_price < 0:
                raise ValueError
        except ValueError:
            row_error("purchase_price must be a non-negative number"); continue

        try:
            selling_price = float(selling_str)
            if selling_price < 0:
                raise ValueError
        except ValueError:
            row_error("selling_price must be a non-negative number"); continue

        # ── Branch resolution ──────────────────────────────────────────────────
        if is_branch_user:
            branch_id = current_user["branch_id"]
        else:
            branch_id = row.get("branch_id", "").strip() or current_user.get("branch_id")
            if not branch_id:
                row_error("branch_id is required for org-level users"); continue
            if not db[Collections.BRANCHES].find_one({"_id": branch_id}):
                row_error(f"Branch '{branch_id}' not found"); continue

        # ── Product lookup ─────────────────────────────────────────────────────
        product = db[Collections.PRODUCTS].find_one(
            {"name": {"$regex": f"^{re.escape(product_name)}$", "$options": "i"}},
            {"_id": 1, "name": 1},
        )
        if not product:
            row_error(f"Product '{product_name}' not found"); continue

        product_id    = product["_id"]
        resolved_name = product["name"]

        # ── Find or create inventory record ────────────────────────────────────
        doc = db[Collections.INVENTORY].find_one({"product_id": product_id, "branch_id": branch_id})
        is_new_inventory = doc is None

        if is_new_inventory:
            now = datetime.now(timezone.utc).isoformat()
            doc = {
                "_id":             new_id(),
                "branch_id":       branch_id,
                "product_id":      product_id,
                "product_name":    resolved_name,
                "batches":         [],
                "basic_sku_total_quantity": 0,
                "basic_sku_count":         0,
                "created_at":      now,
                "updated_at":      now,
                **audit_create_fields(current_user),
            }
            db[Collections.INVENTORY].insert_one(doc)

        # ── Add or increment batch ─────────────────────────────────────────────
        batches  = list(doc.get("batches", []))
        existing = next((b for b in batches if b["batch_number"] == batch_number), None)

        if existing:
            existing["quantity"] += quantity
        else:
            batches.append({
                "batch_number":   batch_number,
                "expiry_date":    expiry_date,
                "quantity":       quantity,
                "received_date":  datetime.now(timezone.utc).date().isoformat(),
            })

        updates = _recalculate_inventory(doc, batches, current_user)
        db[Collections.INVENTORY].update_one({"_id": doc["_id"]}, {"$set": updates})

        if is_new_inventory:
            result.created += 1
        else:
            result.updated += 1

    return result


# ── Movement history (must be before /{inventory_id}) ────────────────────────

@router.get("/{inventory_id}/history", response_model=PaginatedResponse[StockMovementLogResponse])
async def get_inventory_history(
    inventory_id:  str,
    movement_type: str | None = Query(default=None),
    page:          int        = Query(default=1, ge=1),
    page_size:     int        = Query(default=20, ge=1, le=100),
    sort_dir:      str | None = Query(default="desc"),
    current_user:  dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.INVENTORY].find_one({"_id": inventory_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    flt: dict = {"product_id": doc["product_id"], "branch_id": doc["branch_id"]}
    if movement_type:
        flt["movement_type"] = movement_type

    sort_order = -1 if sort_dir == "desc" else 1
    total = db[Collections.STOCK_MOVEMENT_LOGS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.STOCK_MOVEMENT_LOGS].find(flt).sort("created_at", sort_order).skip(skip).limit(page_size)
    items = [StockMovementLogResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[StockMovementLogResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{inventory_id}", response_model=InventoryResponse)
async def get_inventory_item(
    inventory_id: str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.INVENTORY].find_one({"_id": inventory_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    ensure_branch_access(doc_to_dict(doc), current_user)
    return InventoryResponse(**doc_to_dict(doc))


def _recalculate_inventory(doc: dict, batches: list, current_user: dict | None = None) -> dict:
    """Recalculate basic_sku_total_quantity from batches."""
    basic_sku_total = sum(b.get("basic_sku_quantity", 0) for b in batches)
    now = datetime.now(timezone.utc).isoformat()
    result = {"batches": batches, "basic_sku_total_quantity": basic_sku_total, "updated_at": now}
    if current_user:
        result.update(audit_update_fields(current_user))
    return result


# ── Batch Stock In ────────────────────────────────────────────────────────────

@router.post("/stock-in/batch", status_code=201)
async def batch_stock_in(
    payload:      BatchStockInPayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db        = get_db()
    branch_id = enforce_branch_on_create(payload.branch_id, current_user)
    results   = []

    for item in payload.items:
        doc = db[Collections.INVENTORY].find_one({"product_id": item.product_id, "branch_id": branch_id})
        if not doc:
            now     = datetime.now(timezone.utc).isoformat()
            product = db[Collections.PRODUCTS].find_one({"_id": item.product_id}, {"name": 1})
            doc     = {
                "_id":            new_id(),
                "branch_id":      branch_id,
                "product_id":     item.product_id,
                "product_name":   product["name"] if product else "",
                "batches":        [],
                "basic_sku_total_quantity": 0,
                "basic_sku_count":         0,
                "created_at":     now,
                "updated_at":     now,
                **audit_create_fields(current_user),
            }
            db[Collections.INVENTORY].insert_one(doc)

        inventory_id = doc["_id"]
        batches      = list(doc.get("batches", []))
        existing     = next((b for b in batches if b["batch_number"] == item.batch_number), None)
        if existing:
            existing["quantity"] += item.quantity
        else:
            batches.append({
                "batch_number":      item.batch_number,
                "expiry_date":       item.expiry_date,
                "quantity":          item.quantity,
                "received_quantity": item.quantity,
                "received_date":     datetime.now(timezone.utc).date().isoformat(),
                "stock_location_id": item.stock_location_id,
            })

        updates = _recalculate_inventory(doc, batches, current_user)
        db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

        log_stock_movement(
            db, current_user, branch_id=branch_id, product_id=item.product_id,
            product_name=doc.get("product_name", ""), batch_number=item.batch_number,
            quantity=item.quantity, movement_type="STOCK_IN",
            notes=item.notes, reference_type="manual",
        )

        results.append(inventory_id)

    return {"processed": len(results), "inventory_ids": list(set(results))}


# ── Stock In (create or update inventory record) ──────────────────────────────
# Must be declared before /{inventory_id}/stock-in to avoid path-param capture.

@router.post("/stock-in", response_model=InventoryResponse, status_code=201)
async def stock_in_create(
    payload:      StockInCreatePayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db        = get_db()
    branch_id = enforce_branch_on_create(payload.branch_id, current_user)

    doc = db[Collections.INVENTORY].find_one({"product_id": payload.product_id, "branch_id": branch_id})
    if not doc:
        now     = datetime.now(timezone.utc).isoformat()
        product = db[Collections.PRODUCTS].find_one({"_id": payload.product_id}, {"name": 1})
        doc     = {
            "_id":            new_id(),
            "branch_id":      branch_id,
            "product_id":     payload.product_id,
            "product_name":   product["name"] if product else "",
            "batches":                 [],
            "basic_sku_total_quantity": 0,
            "basic_sku_count":         0,
            "created_at":              now,
            "updated_at":              now,
            **audit_create_fields(current_user),
        }
        db[Collections.INVENTORY].insert_one(doc)

    inventory_id = doc["_id"]
    batches      = list(doc.get("batches", []))
    existing     = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if existing:
        existing["quantity"] += payload.quantity
    else:
        batches.append({
            "batch_number":        payload.batch_number,
            "expiry_date":         payload.expiry_date,
            "quantity":            payload.quantity,
            "received_quantity":   payload.quantity,
            "received_date":       datetime.now(timezone.utc).date().isoformat(),
            "manufacture_date":    payload.manufacture_date,
            "stock_location_id":   payload.stock_location_id,
            "channel_id":          payload.channel_id,
            "purchase_invoice_id": payload.purchase_invoice_id,
        })

    updates = _recalculate_inventory(doc, batches, current_user)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

    log_stock_movement(
        db, current_user, branch_id=branch_id, product_id=payload.product_id,
        product_name=doc.get("product_name", ""), batch_number=payload.batch_number,
        quantity=payload.quantity, movement_type="STOCK_IN",
        notes=payload.notes, reference_type="manual",
        expiry_date=payload.expiry_date,
        sku=payload.sku, purchase_price=payload.purchase_price, selling_price=payload.selling_price,
        stock_location_id=payload.stock_location_id,
    )

    return InventoryResponse(**doc_to_dict(db[Collections.INVENTORY].find_one({"_id": inventory_id})))


# ── Stock In (existing inventory record) ─────────────────────────────────────

@router.post("/{inventory_id}/stock-in", response_model=InventoryResponse)
async def stock_in(
    inventory_id: str,
    payload:      StockInPayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.INVENTORY].find_one({"_id": inventory_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    batches = list(doc.get("batches", []))

    existing = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if existing:
        existing["quantity"] += payload.quantity
    else:
        batches.append({
            "batch_number":        payload.batch_number,
            "expiry_date":         payload.expiry_date,
            "quantity":            payload.quantity,
            "received_quantity":   payload.quantity,
            "received_date":       datetime.now(timezone.utc).date().isoformat(),
            "manufacture_date":    payload.manufacture_date,
            "stock_location_id":   payload.stock_location_id,
            "channel_id":          payload.channel_id,
            "purchase_invoice_id": payload.purchase_invoice_id,
        })

    updates = _recalculate_inventory(doc, batches, current_user)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

    log_stock_movement(
        db, current_user, branch_id=doc.get("branch_id", ""),
        product_id=doc.get("product_id", ""), product_name=doc.get("product_name", ""),
        batch_number=payload.batch_number, quantity=payload.quantity,
        movement_type="STOCK_IN", notes=payload.notes, reference_type="manual",
        expiry_date=payload.expiry_date,
        sku=payload.sku, purchase_price=payload.purchase_price, selling_price=payload.selling_price,
        stock_location_id=payload.stock_location_id,
    )

    return InventoryResponse(**doc_to_dict(db[Collections.INVENTORY].find_one({"_id": inventory_id})))


# ── Stock Out ─────────────────────────────────────────────────────────────────

@router.post("/{inventory_id}/stock-out", response_model=InventoryResponse)
async def stock_out(
    inventory_id: str,
    payload:      StockOutPayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.INVENTORY].find_one({"_id": inventory_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    batches = list(doc.get("batches", []))
    batch   = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{payload.batch_number}' not found")
    if payload.quantity > batch["quantity"]:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock: requested {payload.quantity}, available {batch['quantity']}",
        )

    batch["quantity"] -= payload.quantity
    batches = [b for b in batches if b["quantity"] > 0]

    updates = _recalculate_inventory(doc, batches, current_user)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

    log_stock_movement(
        db, current_user, branch_id=doc.get("branch_id", ""),
        product_id=doc.get("product_id", ""), product_name=doc.get("product_name", ""),
        batch_number=payload.batch_number, quantity=payload.quantity,
        movement_type="STOCK_OUT", reason=payload.reason,
        notes=payload.notes, reference_type="manual",
    )

    return InventoryResponse(**doc_to_dict(db[Collections.INVENTORY].find_one({"_id": inventory_id})))


# ── Stock Movements ──────────────────────────────────────────────────────────

@router.get("/movements", response_model=PaginatedResponse[StockMovementLogResponse])
async def list_movements(
    branch_id:     str | None = Query(default=None),
    product_id:    str | None = Query(default=None),
    movement_type: str | None = Query(default=None),
    page:          int = Query(default=1, ge=1),
    page_size:     int = Query(default=20, ge=1, le=100),
    sort_dir:      str | None = Query(default="desc"),
    current_user:  dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    apply_branch_filter(flt, current_user, branch_id)
    if product_id:
        flt["product_id"] = product_id
    if movement_type:
        flt["movement_type"] = movement_type

    sort_order = 1 if sort_dir == "asc" else -1
    total = db[Collections.STOCK_MOVEMENT_LOGS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.STOCK_MOVEMENT_LOGS].find(flt).sort("created_at", sort_order).skip(skip).limit(page_size)
    items = [StockMovementLogResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[StockMovementLogResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )
