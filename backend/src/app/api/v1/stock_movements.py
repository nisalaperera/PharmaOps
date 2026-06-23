import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from pymongo import DESCENDING, ASCENDING
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.branch_scope import apply_branch_filter, ensure_branch_access, enforce_branch_on_create
from app.utils.stock_log import log_stock_movement
from app.utils.sequences import generate_document_number, get_branch_code
from app.models.stock_movement import (
    StockMovementCreate, StockMovementUpdate, StockMovementResponse,
    ConfirmItemPayload,
)
from app.models.inventory import LocationSuggestionResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/stock-movements", tags=["Stock Movements"])

SORT_FIELDS = {"created_at", "movement_number", "status", "type"}


def _recalc_inventory(db, inventory_id: str, batches: list, current_user: dict, basic_sku: str | None = None, basic_sku_count: int | None = None):
    basic_sku_total = sum(b.get("basic_sku_quantity", 0) for b in batches)
    now = datetime.now(timezone.utc).isoformat()
    updates: dict = {
        "batches": batches,
        "basic_sku_total_quantity": basic_sku_total,
        "updated_at": now,
        **audit_update_fields(current_user),
    }
    if basic_sku is not None:
        updates["basic_sku"] = basic_sku
    if basic_sku_count is not None:
        updates["basic_sku_count"] = basic_sku_count
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})


def _update_movement_status(db, movement_id: str, items: list, current_user: dict):
    confirmed_count = sum(1 for it in items if it.get("is_confirmed"))
    total_count = len(items)
    if confirmed_count == 0:
        status = "CREATED"
    elif confirmed_count < total_count:
        status = "PARTIALLY_COMPLETED"
    else:
        status = "COMPLETED"
    now = datetime.now(timezone.utc).isoformat()
    db[Collections.STOCK_MOVEMENTS].update_one(
        {"_id": movement_id},
        {"$set": {"items": items, "status": status, "updated_at": now, **audit_update_fields(current_user)}},
    )
    return status


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[StockMovementResponse])
async def list_stock_movements(
    movement_type: str | None = Query(default=None, alias="type"),
    status:        str | None = Query(default=None),
    search:        str | None = Query(default=None),
    page:          int        = Query(default=1, ge=1),
    page_size:     int        = Query(default=20, ge=1, le=100),
    sort_by:       str | None = Query(default="created_at"),
    sort_dir:      str | None = Query(default="desc"),
    current_user:  dict = Depends(get_current_user),
):
    db   = get_db()
    filt: dict = {}
    apply_branch_filter(filt, current_user)
    if movement_type: filt["type"]   = movement_type
    if status:        filt["status"] = status
    if search:        filt["movement_number"] = {"$regex": re.escape(search), "$options": "i"}

    total      = db[Collections.STOCK_MOVEMENTS].count_documents(filt)
    sort_field = sort_by if sort_by in SORT_FIELDS else "created_at"
    sort_order = DESCENDING if sort_dir == "desc" else ASCENDING
    skip_val   = (page - 1) * page_size

    docs = db[Collections.STOCK_MOVEMENTS].find(filt).sort(sort_field, sort_order).skip(skip_val).limit(page_size)
    items = [StockMovementResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[StockMovementResponse](
        data=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


# ── Suggest stock location ────────────────────────────────────────────────────

@router.get("/suggest-location", response_model=LocationSuggestionResponse)
async def suggest_stock_location(
    product_id:   str = Query(...),
    batch_number: str = Query(...),
    expiry_date:  str = Query(...),
    branch_id:    str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    resolved_branch = branch_id or current_user.get("branch_id", "")

    today = datetime.now(timezone.utc).date().isoformat()
    is_expired = expiry_date < today

    # Step 1: Check movement logs for same product + same batch
    log_match = db[Collections.STOCK_MOVEMENT_LOGS].find_one(
        {"product_id": product_id, "batch_number": batch_number, "stock_location_id": {"$ne": None, "$ne": ""}},
        sort=[("created_at", DESCENDING)],
    )
    if log_match and log_match.get("stock_location_id"):
        loc = db[Collections.STOCK_LOCATIONS].find_one({"_id": log_match["stock_location_id"]})
        if loc:
            return LocationSuggestionResponse(
                stock_location_id=loc["_id"], stock_location_name=loc.get("name", ""), is_new=False,
            )

    if is_expired:
        # Step 2 (expired): EXP-{brand_name}-{year}
        product = db[Collections.PRODUCTS].find_one({"_id": product_id}, {"brand_id": 1})
        brand_name = ""
        if product and product.get("brand_id"):
            brand = db[Collections.BRANDS].find_one({"_id": product["brand_id"]}, {"name": 1})
            brand_name = brand["name"] if brand else ""

        if brand_name:
            expiry_year = expiry_date[:4]
            suggested_name = f"EXP-{brand_name}-{expiry_year}"
            loc = db[Collections.STOCK_LOCATIONS].find_one(
                {"branch_id": resolved_branch, "name": {"$regex": f"^{re.escape(suggested_name)}$", "$options": "i"}},
            )
            if loc:
                return LocationSuggestionResponse(
                    stock_location_id=loc["_id"], stock_location_name=loc.get("name", ""), is_new=False,
                )
            return LocationSuggestionResponse(stock_location_name=suggested_name, is_new=True)
    else:
        # Step 2 (non-expired): Check logs for same product, non-expired batches
        non_expired_match = db[Collections.STOCK_MOVEMENT_LOGS].find_one(
            {
                "product_id": product_id,
                "stock_location_id": {"$ne": None, "$ne": ""},
                "$or": [{"expiry_date": {"$gte": today}}, {"expiry_date": None}],
            },
            sort=[("created_at", DESCENDING)],
        )
        if non_expired_match and non_expired_match.get("stock_location_id"):
            loc = db[Collections.STOCK_LOCATIONS].find_one({"_id": non_expired_match["stock_location_id"]})
            if loc:
                return LocationSuggestionResponse(
                    stock_location_id=loc["_id"], stock_location_name=loc.get("name", ""), is_new=False,
                )

        # Step 3 (non-expired): {category_name}-{generic_name}
        product = db[Collections.PRODUCTS].find_one({"_id": product_id}, {"category_id": 1, "generic_id": 1})
        category_name = ""
        generic_name = ""
        if product:
            if product.get("category_id"):
                cat = db[Collections.CATEGORIES].find_one({"_id": product["category_id"]}, {"name": 1})
                category_name = cat["name"] if cat else ""
            if product.get("generic_id"):
                gen = db[Collections.GENERICS].find_one({"_id": product["generic_id"]}, {"name": 1})
                generic_name = gen["name"] if gen else ""

        if category_name:
            suggested_name = f"{category_name}-{generic_name}" if generic_name else category_name
            loc = db[Collections.STOCK_LOCATIONS].find_one(
                {"branch_id": resolved_branch, "name": {"$regex": f"^{re.escape(suggested_name)}$", "$options": "i"}},
            )
            if loc:
                return LocationSuggestionResponse(
                    stock_location_id=loc["_id"], stock_location_name=loc.get("name", ""), is_new=False,
                )
            return LocationSuggestionResponse(stock_location_name=suggested_name, is_new=True)

    return LocationSuggestionResponse()


# ── Get single ───────────────────────────────────────────────────────────────

@router.get("/{movement_id}", response_model=StockMovementResponse)
async def get_stock_movement(movement_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.STOCK_MOVEMENTS].find_one({"_id": movement_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Stock movement not found")
    ensure_branch_access(doc_to_dict(doc), current_user)
    return StockMovementResponse(**doc_to_dict(doc))


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=StockMovementResponse, status_code=201)
async def create_stock_movement(
    payload:      StockMovementCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db        = get_db()
    branch_id = enforce_branch_on_create(payload.branch_id, current_user)
    branch_code = get_branch_code(db, branch_id)
    doc_type    = "SI" if payload.type == "STOCK_IN" else "SO"

    movement_number = generate_document_number(db, branch_code, doc_type)

    items = []
    for it in payload.items:
        product = db[Collections.PRODUCTS].find_one({"_id": it.product_id}, {"name": 1})
        item_dict = it.model_dump()
        item_dict["product_name"] = product["name"] if product else ""

        if payload.type == "STOCK_OUT":
            inv = db[Collections.INVENTORY].find_one({"product_id": it.product_id, "branch_id": branch_id})
            if not inv:
                raise HTTPException(status_code=400, detail=f"No inventory for product '{item_dict['product_name']}'")
            batch = next((b for b in inv.get("batches", []) if b["batch_number"] == it.batch_number), None)
            if not batch:
                raise HTTPException(status_code=400, detail=f"Batch '{it.batch_number}' not found for '{item_dict['product_name']}'")
            if batch["quantity"] < it.quantity:
                raise HTTPException(status_code=400, detail=f"Insufficient qty for batch '{it.batch_number}' (available: {batch['quantity']})")

        items.append(item_dict)

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    doc = {
        "_id":             doc_id,
        "movement_number": movement_number,
        "type":            payload.type,
        "branch_id":       branch_id,
        "status":          "CREATED",
        "items":           items,
        "notes":           payload.notes,
        "created_at":      now,
        "updated_at":      now,
        **audit_create_fields(current_user),
    }
    db[Collections.STOCK_MOVEMENTS].insert_one(doc)
    return StockMovementResponse(**doc_to_dict(doc))


# ── Update (only CREATED status) ─────────────────────────────────────────────

@router.put("/{movement_id}", response_model=StockMovementResponse)
async def update_stock_movement(
    movement_id:  str,
    payload:      StockMovementUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.STOCK_MOVEMENTS].find_one({"_id": movement_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Stock movement not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    if doc["status"] != "CREATED":
        raise HTTPException(status_code=400, detail="Cannot edit a movement that has been partially or fully completed")

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat(), **audit_update_fields(current_user)}

    if payload.items is not None:
        items = []
        for it in payload.items:
            product = db[Collections.PRODUCTS].find_one({"_id": it.product_id}, {"name": 1})
            item_dict = it.model_dump()
            item_dict["product_name"] = product["name"] if product else ""
            items.append(item_dict)
        updates["items"] = items

    if payload.notes is not None:
        updates["notes"] = payload.notes

    db[Collections.STOCK_MOVEMENTS].update_one({"_id": movement_id}, {"$set": updates})
    return StockMovementResponse(**doc_to_dict(db[Collections.STOCK_MOVEMENTS].find_one({"_id": movement_id})))


# ── Confirm single item ──────────────────────────────────────────────────────

@router.post("/{movement_id}/confirm-item", response_model=StockMovementResponse)
async def confirm_item(
    movement_id:  str,
    payload:      ConfirmItemPayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.STOCK_MOVEMENTS].find_one({"_id": movement_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Stock movement not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    if doc["status"] == "COMPLETED":
        raise HTTPException(status_code=400, detail="Movement is already completed")

    items = doc.get("items", [])
    idx   = payload.item_index
    if idx < 0 or idx >= len(items):
        raise HTTPException(status_code=400, detail="Invalid item index")

    item = items[idx]
    if item.get("is_confirmed"):
        raise HTTPException(status_code=400, detail="Item already confirmed")

    item["is_confirmed"]      = True
    item["confirmed_quantity"] = payload.confirmed_quantity
    if payload.stock_location_id:
        item["stock_location_id"]   = payload.stock_location_id
    if payload.stock_location_name:
        item["stock_location_name"] = payload.stock_location_name

    branch_id    = doc["branch_id"]
    product_id   = item["product_id"]
    product_name = item.get("product_name", "")
    movement_type = doc["type"]

    product_doc   = db[Collections.PRODUCTS].find_one({"_id": product_id})
    basic_sku     = product_doc.get("basic_sku_name", "") if product_doc else ""
    sku_name      = item.get("sku", "")
    sku_mappings  = product_doc.get("sku_mappings", []) if product_doc else []
    basic_sku_count = 1
    for m in sku_mappings:
        if m.get("sku") == sku_name:
            basic_sku_count = m.get("basic_sku_count", 1)
            break

    basic_qty    = payload.confirmed_quantity * basic_sku_count
    sell_price   = item.get("selling_price", 0)
    buy_price    = item.get("purchase_price", 0)
    basic_sell   = round(sell_price / basic_sku_count, 2) if basic_sku_count > 0 else sell_price
    basic_buy    = round(buy_price / basic_sku_count, 2) if basic_sku_count > 0 else buy_price

    item["basic_sku"]               = basic_sku
    item["basic_sku_count"]         = basic_sku_count
    item["basic_sku_quantity"]      = basic_qty
    item["basic_sku_selling_price"] = basic_sell
    item["basic_sku_purchase_price"] = basic_buy

    log_kwargs = dict(
        expiry_date=item.get("expiry_date"),
        sku=sku_name, purchase_price=buy_price, selling_price=sell_price,
        basic_sku=basic_sku, basic_sku_count=basic_sku_count, basic_sku_quantity=basic_qty,
        basic_sku_selling_price=basic_sell, basic_sku_purchase_price=basic_buy,
        stock_location_id=payload.stock_location_id,
    )

    if movement_type == "STOCK_IN":
        inv = db[Collections.INVENTORY].find_one({"product_id": product_id, "branch_id": branch_id})
        if not inv:
            now = datetime.now(timezone.utc).isoformat()
            inv = {
                "_id":                     new_id(),
                "branch_id":               branch_id,
                "product_id":              product_id,
                "product_name":            product_name,
                "basic_sku":               basic_sku,
                "basic_sku_count":         basic_sku_count,
                "basic_sku_total_quantity": 0,
                "batches":                 [],
                "created_at":              now,
                "updated_at":              now,
                **audit_create_fields(current_user),
            }
            db[Collections.INVENTORY].insert_one(inv)

        batches  = list(inv.get("batches", []))
        existing = next((b for b in batches if b["batch_number"] == item["batch_number"]), None)
        if existing:
            existing["quantity"]           += payload.confirmed_quantity
            existing["basic_sku_quantity"] = existing.get("basic_sku_quantity", 0) + basic_qty
        else:
            batches.append({
                "batch_number":            item["batch_number"],
                "expiry_date":             item["expiry_date"],
                "quantity":                payload.confirmed_quantity,
                "received_quantity":       payload.confirmed_quantity,
                "basic_sku":               basic_sku,
                "basic_sku_quantity":       basic_qty,
                "basic_sku_selling_price":  basic_sell,
                "basic_sku_purchase_price": basic_buy,
            })
        _recalc_inventory(db, inv["_id"], batches, current_user, basic_sku, basic_sku_count)

        log_stock_movement(
            db, current_user, branch_id=branch_id, product_id=product_id,
            product_name=product_name, batch_number=item["batch_number"],
            quantity=payload.confirmed_quantity, movement_type="STOCK_IN",
            reference_id=movement_id, reference_type="stock_movement",
            **log_kwargs,
        )

    elif movement_type == "STOCK_OUT":
        inv = db[Collections.INVENTORY].find_one({"product_id": product_id, "branch_id": branch_id})
        if not inv:
            raise HTTPException(status_code=400, detail=f"No inventory found for '{product_name}'")

        batches = list(inv.get("batches", []))
        batch   = next((b for b in batches if b["batch_number"] == item["batch_number"]), None)
        if not batch:
            raise HTTPException(status_code=400, detail=f"Batch '{item['batch_number']}' not found")
        if batch["quantity"] < payload.confirmed_quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient qty (available: {batch['quantity']})")

        batch["quantity"]          -= payload.confirmed_quantity
        batch["basic_sku_quantity"] = batch.get("basic_sku_quantity", 0) - basic_qty
        if batch["basic_sku_quantity"] < 0:
            batch["basic_sku_quantity"] = 0
        if batch["quantity"] <= 0:
            batches = [b for b in batches if b["batch_number"] != item["batch_number"]]

        _recalc_inventory(db, inv["_id"], batches, current_user, basic_sku, basic_sku_count)

        log_stock_movement(
            db, current_user, branch_id=branch_id, product_id=product_id,
            product_name=product_name, batch_number=item["batch_number"],
            quantity=payload.confirmed_quantity, movement_type="STOCK_OUT",
            reason=item.get("reason"), reference_id=movement_id, reference_type="stock_movement",
            **log_kwargs,
        )

    status = _update_movement_status(db, movement_id, items, current_user)
    updated_doc = db[Collections.STOCK_MOVEMENTS].find_one({"_id": movement_id})
    return StockMovementResponse(**doc_to_dict(updated_doc))


# ── Delete (only CREATED status) ─────────────────────────────────────────────

@router.delete("/{movement_id}", status_code=204)
async def delete_stock_movement(
    movement_id:  str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.STOCK_MOVEMENTS].find_one({"_id": movement_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Stock movement not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    if doc["status"] != "CREATED":
        raise HTTPException(status_code=400, detail="Cannot delete a movement that has been partially or fully completed")

    db[Collections.STOCK_MOVEMENTS].delete_one({"_id": movement_id})
