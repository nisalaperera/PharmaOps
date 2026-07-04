from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File, Body
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io, re
from app.core.database import get_db, Collections, doc_to_dict
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.utils.audit import audit_update_fields
from app.utils.branch_scope import apply_branch_filter, ensure_branch_access, enforce_branch_on_create, effective_branch_id, BRANCH_LEVEL_ROLES
from app.utils.stock_log import log_inventory
from app.utils.inventory_stock import batch_qty, set_batch_qty, inventory_totals, find_or_create_inventory, resolve_basic_sku_count
from app.models.inventory import (
    InventoryResponse,
    StockInPayload, StockInCreatePayload, BatchStockInPayload,
    StockOutPayload, InventoryLogResponse, LatestStockInResponse,
)
from app.models.common import PaginatedResponse, ImportResult, ImportRowError

router = APIRouter(prefix="/inventory", tags=["Inventory"])

INVENTORY_SORT_FIELDS = {"product_id", "basic_sku", "created_at"}


def _build_filter(
    current_user: dict,
    branch_id:    str | None,
    search:       str | None,
) -> dict:
    flt: dict = {}
    apply_branch_filter(flt, current_user, branch_id)
    if search:
        flt["product_id"] = {"$regex": re.escape(search), "$options": "i"}
    return flt


# ── Bulk stock check ─────────────────────────────────────────────────────────

@router.post("/stock-check")
async def bulk_stock_check(
    branch_id:    str        = Body(...),
    product_ids:  list[str]  = Body(...),
    current_user: dict       = Depends(get_current_user),
):
    db  = get_db()
    bid = effective_branch_id(current_user, branch_id) or branch_id
    docs = db[Collections.INVENTORY].find({
        "branch_id":  bid,
        "product_id": {"$in": product_ids},
    })
    result: dict[str, int] = {}
    for doc in docs:
        pid = doc.get("product_id")
        total = sum(batch_qty(b) for b in doc.get("batches", []))
        result[pid] = result.get(pid, 0) + total
    for pid in product_ids:
        if pid not in result:
            result[pid] = 0
    return result


# ── Batch comments ────────────────────────────────────────────────────────────

@router.post("/batch-comment")
async def add_batch_comment(
    branch_id:    str = Body(...),
    product_id:   str = Body(...),
    batch_number: str = Body(...),
    staff_name:   str = Body(...),
    text:         str = Body(...),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    if current_user["role"] in BRANCH_LEVEL_ROLES and branch_id != current_user.get("branch_id"):
        raise HTTPException(status_code=403, detail="Cannot comment on another branch's inventory")

    result = db[Collections.INVENTORY].update_one(
        {"branch_id": branch_id, "product_id": product_id, "batches.batch_number": batch_number},
        {"$push": {"batches.$.comments": {"staff_name": staff_name, "text": text, "created_at": now}}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inventory batch not found")

    return {"status": "ok", "created_at": now}


# ── Bulk batch details (for return items) ─────────────────────────────────────

@router.post("/batch-details")
async def bulk_batch_details(
    branch_id:    str        = Body(...),
    product_ids:  list[str]  = Body(...),
    current_user: dict       = Depends(get_current_user),
):
    db  = get_db()
    bid = effective_branch_id(current_user, branch_id) or branch_id
    docs = db[Collections.INVENTORY].find({
        "branch_id":  bid,
        "product_id": {"$in": product_ids},
    })

    pid_set = set(product_ids)
    product_map: dict[str, str] = {}
    for p in db[Collections.PRODUCTS].find({"_id": {"$in": product_ids}}, {"_id": 1, "name": 1}):
        product_map[p["_id"]] = p.get("name", "")

    items = []
    for d in docs:
        data = doc_to_dict(d)
        data["product_name"] = product_map.get(data.get("product_id", ""), "")
        items.append(data)
        pid_set.discard(data.get("product_id"))

    return items


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[InventoryResponse])
async def list_inventory(
    branch_id:    str | None  = Query(default=None),
    search:       str | None  = Query(default=None),
    page:         int         = Query(default=1, ge=1),
    page_size:    int         = Query(default=20, ge=1, le=100),
    sort_by:      str | None  = Query(default="created_at"),
    sort_dir:     str | None  = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt = _build_filter(current_user, branch_id, search)

    sort_field     = sort_by if sort_by in INVENTORY_SORT_FIELDS else "created_at"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.INVENTORY].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = list(db[Collections.INVENTORY].find(flt).sort(sort_field, sort_direction).skip(skip).limit(page_size))

    product_ids = list({d["product_id"] for d in docs if d.get("product_id")})
    product_map = {}
    if product_ids:
        for p in db[Collections.PRODUCTS].find({"_id": {"$in": product_ids}}, {"_id": 1, "name": 1}):
            product_map[p["_id"]] = p.get("name", "")

    sku_ids_to_resolve = list({d["basic_sku_id"] for d in docs if d.get("basic_sku_id") and not d.get("basic_sku")})
    sku_name_map: dict[str, str] = {}
    if sku_ids_to_resolve:
        for s in db[Collections.SKUS].find({"_id": {"$in": sku_ids_to_resolve}}, {"_id": 1, "name": 1}):
            sku_name_map[s["_id"]] = s.get("name", "")

    items = []
    for d in docs:
        data = doc_to_dict(d)
        data["product_name"] = product_map.get(data.get("product_id", ""), "")
        if not data.get("basic_sku") and data.get("basic_sku_id"):
            data["basic_sku"] = sku_name_map.get(data["basic_sku_id"], "")
        items.append(InventoryResponse(**data))

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
    docs = db[Collections.INVENTORY].find(flt).sort("created_at", 1)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Product ID", "Branch ID", "Basic SKU", "Basic SKU ID", "Updated At",
    ])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("product_id", ""),
            d.get("branch_id", ""),
            d.get("basic_sku", ""),
            d.get("basic_sku_id", ""),
            d.get("updated_at", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory_export.csv"},
    )


# ── Latest Stock-In lookup ────────────────────────────────────────────────────
# Must be declared before /{inventory_id} to avoid path-parameter capture.

@router.get("/latest-stock-in", response_model=LatestStockInResponse)
async def get_latest_stock_in(
    product_id:   str        = Query(...),
    branch_id:    str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    resolved_branch = branch_id or current_user.get("branch_id", "")

    flt: dict = {
        "product_id":    product_id,
        "branch_id":     resolved_branch,
        "movement_type": "STOCK_IN",
    }
    log = db[Collections.INVENTORY_LOGS].find_one(flt, sort=[("created_at", -1)])
    if not log:
        return LatestStockInResponse()

    return LatestStockInResponse(
        found=True,
        batch_number=log.get("batch_number", ""),
        expiry_date=log.get("expiry_date", ""),
        sku=log.get("sku"),
        selling_price=log.get("selling_price", 0) or 0,
        purchase_price=log.get("purchase_price", 0) or 0,
        basic_sku_count=log.get("basic_sku_count", 1) or 1,
        basic_sku_selling_price=log.get("basic_sku_selling_price", 0) or 0,
        basic_sku_purchase_price=log.get("basic_sku_purchase_price", 0) or 0,
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
    for _enc in ("utf-8-sig", "latin-1"):
        try:
            text = content.decode(_enc); break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(status_code=400, detail="File encoding not supported. Please save as UTF-8.")

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
            {"_id": 1, "name": 1, "basic_sku_id": 1, "basic_sku_name": 1, "sku_mappings": 1},
        )
        if not product:
            row_error(f"Product '{product_name}' not found"); continue

        product_id      = product["_id"]
        resolved_name   = product["name"]
        basic_sku_name  = product.get("basic_sku_name", "")
        basic_sku_id    = product.get("basic_sku_id", "")
        sku_name        = row.get("sku", "") or basic_sku_name
        basic_sku_count = resolve_basic_sku_count(product, sku_name)
        basic_qty       = quantity * basic_sku_count
        basic_sell      = round(selling_price / basic_sku_count, 2) if basic_sku_count > 0 else selling_price
        basic_buy       = round(purchase_price / basic_sku_count, 2) if basic_sku_count > 0 else purchase_price

        # ── Find or create inventory record ────────────────────────────────────
        doc = find_or_create_inventory(
            db, current_user,
            product_id=product_id, branch_id=branch_id,
            basic_sku_name=basic_sku_name, basic_sku_id=basic_sku_id,
            product_name=resolved_name,
        )
        is_new_inventory = not doc.get("batches")

        # ── Add or increment batch ─────────────────────────────────────────────
        batches  = list(doc.get("batches", []))
        existing = next((b for b in batches if b["batch_number"] == batch_number), None)

        if existing:
            set_batch_qty(existing, batch_qty(existing) + basic_qty)
        else:
            batches.append({
                "batch_number":             batch_number,
                "expiry_date":              expiry_date,
                "basic_sku_quantity":       basic_qty,
                "sku":                      sku_name,
                "purchase_price":           purchase_price,
                "selling_price":            selling_price,
                "basic_sku_purchase_price": basic_buy,
                "basic_sku_selling_price":  basic_sell,
                "supplier_name":            row.get("supplier_name", ""),
                "received_date":            datetime.now(timezone.utc).date().isoformat(),
            })

        updates = _recalculate_inventory(doc, batches, current_user)
        db[Collections.INVENTORY].update_one({"_id": doc["_id"]}, {"$set": updates})

        log_inventory(
            db, current_user, branch_id=branch_id, product_id=product_id,
            batch_number=batch_number, quantity=quantity, movement_type="STOCK_IN",
            expiry_date=expiry_date, sku=sku_name,
            selling_price=selling_price, purchase_price=purchase_price,
            basic_sku=basic_sku_name, basic_sku_id=basic_sku_id, basic_sku_count=basic_sku_count,
            basic_sku_quantity=basic_qty, basic_sku_selling_price=basic_sell, basic_sku_purchase_price=basic_buy,
            reference_type="import", reference_value=file.filename,
        )

        if is_new_inventory:
            result.created += 1
        else:
            result.updated += 1

    return result


# ── Stock Movements (must be before /{inventory_id}) ─────────────────────────

@router.get("/movements", response_model=PaginatedResponse[InventoryLogResponse])
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
    total = db[Collections.INVENTORY_LOGS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.INVENTORY_LOGS].find(flt).sort("created_at", sort_order).skip(skip).limit(page_size)
    items = [InventoryLogResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[InventoryLogResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


# ── Movement history (must be before /{inventory_id}) ────────────────────────

@router.get("/{inventory_id}/history", response_model=PaginatedResponse[InventoryLogResponse])
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
    total = db[Collections.INVENTORY_LOGS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.INVENTORY_LOGS].find(flt).sort("created_at", sort_order).skip(skip).limit(page_size)
    items = [InventoryLogResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[InventoryLogResponse](
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
    data = doc_to_dict(doc)
    product = db[Collections.PRODUCTS].find_one({"_id": data.get("product_id")}, {"name": 1})
    data["product_name"] = product.get("name", "") if product else ""
    return InventoryResponse(**data)


def _recalculate_inventory(doc: dict, batches: list, current_user: dict | None = None) -> dict:
    result = inventory_totals(doc, batches)
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
        product_doc = db[Collections.PRODUCTS].find_one({"_id": item.product_id})
        basic_sku_id   = product_doc.get("basic_sku_id", "")   if product_doc else ""
        basic_sku_name = product_doc.get("basic_sku_name", "") if product_doc else ""
        if not basic_sku_name and basic_sku_id:
            sku_doc = db[Collections.SKUS].find_one({"_id": basic_sku_id}, {"name": 1})
            basic_sku_name = sku_doc.get("name", "") if sku_doc else ""

        sku_name      = item.sku or basic_sku_name
        sku_mappings  = product_doc.get("sku_mappings", []) if product_doc else []
        basic_sku_count = 1
        for m in sku_mappings:
            if m.get("sku") == sku_name:
                basic_sku_count = m.get("basic_sku_count", 1)
                break

        basic_qty  = item.quantity * basic_sku_count
        basic_sell = round(item.selling_price / basic_sku_count, 2) if basic_sku_count > 0 else item.selling_price
        basic_buy  = round(item.purchase_price / basic_sku_count, 2) if basic_sku_count > 0 else item.purchase_price

        doc = find_or_create_inventory(
            db, current_user,
            product_id=item.product_id, branch_id=branch_id,
            basic_sku_name=basic_sku_name, basic_sku_id=basic_sku_id,
            product_name=(product_doc or {}).get("name", ""),
        )

        inventory_id = doc["_id"]
        batches      = list(doc.get("batches", []))
        existing     = next((b for b in batches if b["batch_number"] == item.batch_number), None)
        if existing:
            set_batch_qty(existing, batch_qty(existing) + basic_qty)
        else:
            batches.append({
                "batch_number":            item.batch_number,
                "expiry_date":             item.expiry_date,
                "basic_sku_quantity":       basic_qty,
                "basic_sku_selling_price":  basic_sell,
                "basic_sku_purchase_price": basic_buy,
            })

        updates = _recalculate_inventory(doc, batches, current_user)
        db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

        log_inventory(
            db, current_user, branch_id=branch_id, product_id=item.product_id,
            batch_number=item.batch_number, quantity=item.quantity, movement_type="STOCK_IN",
            expiry_date=item.expiry_date, sku=sku_name,
            selling_price=item.selling_price, purchase_price=item.purchase_price,
            basic_sku=basic_sku_name, basic_sku_id=basic_sku_id, basic_sku_count=basic_sku_count,
            basic_sku_quantity=basic_qty, basic_sku_selling_price=basic_sell, basic_sku_purchase_price=basic_buy,
            stock_location_id=item.stock_location_id, notes=item.notes, reference_type="manual",
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

    product_doc    = db[Collections.PRODUCTS].find_one({"_id": payload.product_id})
    basic_sku_id   = product_doc.get("basic_sku_id", "")   if product_doc else ""
    basic_sku_name = product_doc.get("basic_sku_name", "") if product_doc else ""
    if not basic_sku_name and basic_sku_id:
        sku_doc = db[Collections.SKUS].find_one({"_id": basic_sku_id}, {"name": 1})
        basic_sku_name = sku_doc.get("name", "") if sku_doc else ""

    sku_name      = payload.sku or basic_sku_name
    sku_mappings  = product_doc.get("sku_mappings", []) if product_doc else []
    basic_sku_count = 1
    for m in sku_mappings:
        if m.get("sku") == sku_name:
            basic_sku_count = m.get("basic_sku_count", 1)
            break

    basic_qty  = payload.quantity * basic_sku_count
    basic_sell = round(payload.selling_price / basic_sku_count, 2) if basic_sku_count > 0 else payload.selling_price
    basic_buy  = round(payload.purchase_price / basic_sku_count, 2) if basic_sku_count > 0 else payload.purchase_price

    doc = find_or_create_inventory(
        db, current_user,
        product_id=payload.product_id, branch_id=branch_id,
        basic_sku_name=basic_sku_name, basic_sku_id=basic_sku_id,
        product_name=(product_doc or {}).get("name", ""),
    )

    inventory_id = doc["_id"]
    batches      = list(doc.get("batches", []))
    existing     = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if existing:
        set_batch_qty(existing, batch_qty(existing) + basic_qty)
    else:
        batches.append({
            "batch_number":            payload.batch_number,
            "expiry_date":             payload.expiry_date,
            "basic_sku_quantity":       basic_qty,
            "basic_sku_selling_price":  basic_sell,
            "basic_sku_purchase_price": basic_buy,
        })

    updates = _recalculate_inventory(doc, batches, current_user)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

    log_inventory(
        db, current_user, branch_id=branch_id, product_id=payload.product_id,
        batch_number=payload.batch_number, quantity=payload.quantity, movement_type="STOCK_IN",
        expiry_date=payload.expiry_date, sku=sku_name,
        selling_price=payload.selling_price, purchase_price=payload.purchase_price,
        basic_sku=basic_sku_name, basic_sku_id=basic_sku_id, basic_sku_count=basic_sku_count,
        basic_sku_quantity=basic_qty, basic_sku_selling_price=basic_sell, basic_sku_purchase_price=basic_buy,
        stock_location_id=payload.stock_location_id, notes=payload.notes, reference_type="manual",
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

    product_doc    = db[Collections.PRODUCTS].find_one({"_id": doc["product_id"]})
    basic_sku_name = doc.get("basic_sku", "")
    basic_sku_id   = doc.get("basic_sku_id", "")

    sku_name      = payload.sku or basic_sku_name
    sku_mappings  = product_doc.get("sku_mappings", []) if product_doc else []
    basic_sku_count = 1
    for m in sku_mappings:
        if m.get("sku") == sku_name:
            basic_sku_count = m.get("basic_sku_count", 1)
            break

    basic_qty  = payload.quantity * basic_sku_count
    basic_sell = round(payload.selling_price / basic_sku_count, 2) if basic_sku_count > 0 else payload.selling_price
    basic_buy  = round(payload.purchase_price / basic_sku_count, 2) if basic_sku_count > 0 else payload.purchase_price

    batches  = list(doc.get("batches", []))
    existing = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if existing:
        set_batch_qty(existing, batch_qty(existing) + basic_qty)
    else:
        batches.append({
            "batch_number":            payload.batch_number,
            "expiry_date":             payload.expiry_date,
            "basic_sku_quantity":       basic_qty,
            "basic_sku_selling_price":  basic_sell,
            "basic_sku_purchase_price": basic_buy,
        })

    updates = _recalculate_inventory(doc, batches, current_user)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

    log_inventory(
        db, current_user, branch_id=doc.get("branch_id", ""),
        product_id=doc.get("product_id", ""),
        batch_number=payload.batch_number, quantity=payload.quantity, movement_type="STOCK_IN",
        expiry_date=payload.expiry_date, sku=sku_name,
        selling_price=payload.selling_price, purchase_price=payload.purchase_price,
        basic_sku=basic_sku_name, basic_sku_id=basic_sku_id, basic_sku_count=basic_sku_count,
        basic_sku_quantity=basic_qty, basic_sku_selling_price=basic_sell, basic_sku_purchase_price=basic_buy,
        stock_location_id=payload.stock_location_id, notes=payload.notes, reference_type="manual",
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

    basic_sku_name  = doc.get("basic_sku", "")
    basic_sku_id    = doc.get("basic_sku_id", "")
    basic_sku_count = 1

    batches = list(doc.get("batches", []))
    batch   = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch '{payload.batch_number}' not found")
    available = batch_qty(batch)
    if payload.quantity > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock: requested {payload.quantity}, available {available}",
        )

    set_batch_qty(batch, available - payload.quantity)
    batches = [b for b in batches if batch_qty(b) > 0]

    updates = _recalculate_inventory(doc, batches, current_user)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})

    log_inventory(
        db, current_user, branch_id=doc.get("branch_id", ""),
        product_id=doc.get("product_id", ""),
        batch_number=payload.batch_number, quantity=payload.quantity, movement_type="STOCK_OUT",
        basic_sku=basic_sku_name, basic_sku_id=basic_sku_id, basic_sku_count=basic_sku_count,
        basic_sku_quantity=payload.quantity,
        reason=payload.reason, notes=payload.notes, reference_type="manual",
    )

    return InventoryResponse(**doc_to_dict(db[Collections.INVENTORY].find_one({"_id": inventory_id})))


