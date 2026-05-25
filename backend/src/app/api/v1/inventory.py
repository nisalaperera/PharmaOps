from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import csv, io, re
from app.core.database import get_db, Collections, doc_to_dict, new_id
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.models.inventory import InventoryResponse, InventoryUpdate, StockInPayload, StockInCreatePayload, StockOutPayload
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/inventory", tags=["Inventory"])

INVENTORY_SORT_FIELDS = {"product_name", "total_quantity", "min_stock_level"}

BRANCH_ROLES = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}


def _build_filter(
    current_user: dict,
    branch_id:    str | None,
    low_stock:    bool | None,
    search:       str | None,
) -> dict:
    flt: dict = {}
    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in BRANCH_ROLES
        else branch_id
    )
    if effective_branch:      flt["branch_id"]    = effective_branch
    if low_stock is not None: flt["is_low_stock"] = low_stock
    if search:                flt["product_name"] = {"$regex": re.escape(search), "$options": "i"}
    return flt


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[InventoryResponse])
async def list_inventory(
    branch_id:    str | None  = Query(default=None),
    low_stock:    bool | None = Query(default=None),
    search:       str | None  = Query(default=None),
    page:         int         = Query(default=1, ge=1),
    page_size:    int         = Query(default=20, ge=1, le=100),
    sort_by:      str | None  = Query(default="product_name"),
    sort_dir:     str | None  = Query(default="asc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt = _build_filter(current_user, branch_id, low_stock, search)

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
    low_stock:    bool | None = Query(default=None),
    search:       str | None  = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    db   = get_db()
    flt  = _build_filter(current_user, branch_id, low_stock, search)
    docs = db[Collections.INVENTORY].find(flt).sort("product_name", 1)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Product Name", "Branch ID", "Total Quantity",
        "Min Stock Level", "Low Stock", "Updated At",
    ])
    for doc in docs:
        d = doc_to_dict(doc)
        writer.writerow([
            d.get("product_name", ""),
            d.get("branch_id", ""),
            d.get("total_quantity", 0),
            d.get("min_stock_level", 0),
            "Yes" if d.get("is_low_stock") else "No",
            d.get("updated_at", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventory_export.csv"},
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
    return InventoryResponse(**doc_to_dict(doc))


# ── Update (min_stock_level only) ─────────────────────────────────────────────

@router.patch("/{inventory_id}", response_model=InventoryResponse)
async def update_inventory(
    inventory_id: str,
    payload:      InventoryUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    if not db[Collections.INVENTORY].find_one({"_id": inventory_id}):
        raise HTTPException(status_code=404, detail="Inventory record not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})
    updated = db[Collections.INVENTORY].find_one({"_id": inventory_id})
    return InventoryResponse(**doc_to_dict(updated))


def _recalculate_inventory(doc: dict, batches: list) -> dict:
    """Recalculate total_quantity and is_low_stock from updated batches."""
    total_qty   = sum(b["quantity"] for b in batches)
    is_low_stock = total_qty <= doc.get("min_stock_level", 0)
    now         = datetime.now(timezone.utc).isoformat()
    return {"batches": batches, "total_quantity": total_qty, "is_low_stock": is_low_stock, "updated_at": now}


# ── Stock In (create or update inventory record) ──────────────────────────────
# Must be declared before /{inventory_id}/stock-in to avoid path-param capture.

@router.post("/stock-in", response_model=InventoryResponse, status_code=201)
async def stock_in_create(
    payload:      StockInCreatePayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db        = get_db()
    branch_id = payload.branch_id or current_user.get("branch_id")
    if not branch_id:
        raise HTTPException(status_code=400, detail="branch_id is required for org-level users")

    doc = db[Collections.INVENTORY].find_one({"product_id": payload.product_id, "branch_id": branch_id})
    if not doc:
        now     = datetime.now(timezone.utc).isoformat()
        product = db[Collections.PRODUCTS].find_one({"_id": payload.product_id}, {"name": 1})
        doc     = {
            "_id":            new_id(),
            "branch_id":      branch_id,
            "product_id":     payload.product_id,
            "product_name":   product["name"] if product else "",
            "batches":        [],
            "total_quantity":  0,
            "min_stock_level": 0,
            "is_low_stock":    False,
            "created_at":     now,
            "updated_at":     now,
        }
        db[Collections.INVENTORY].insert_one(doc)

    inventory_id = doc["_id"]
    batches      = list(doc.get("batches", []))
    existing     = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if existing:
        existing["quantity"] += payload.quantity
    else:
        batches.append({
            "batch_number":   payload.batch_number,
            "expiry_date":    payload.expiry_date,
            "quantity":       payload.quantity,
            "purchase_price": payload.purchase_price,
            "selling_price":  payload.selling_price,
            "supplier_id":    payload.supplier_id or "",
            "supplier_name":  payload.supplier_name or "",
            "received_date":  datetime.now(timezone.utc).date().isoformat(),
        })

    updates = _recalculate_inventory(doc, batches)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})
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

    batches = list(doc.get("batches", []))

    existing = next((b for b in batches if b["batch_number"] == payload.batch_number), None)
    if existing:
        existing["quantity"] += payload.quantity
    else:
        batches.append({
            "batch_number":   payload.batch_number,
            "expiry_date":    payload.expiry_date,
            "quantity":       payload.quantity,
            "purchase_price": payload.purchase_price,
            "selling_price":  payload.selling_price,
            "supplier_id":    payload.supplier_id or "",
            "supplier_name":  payload.supplier_name or "",
            "received_date":  datetime.now(timezone.utc).date().isoformat(),
        })

    updates = _recalculate_inventory(doc, batches)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})
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

    updates = _recalculate_inventory(doc, batches)
    db[Collections.INVENTORY].update_one({"_id": inventory_id}, {"$set": updates})
    return InventoryResponse(**doc_to_dict(db[Collections.INVENTORY].find_one({"_id": inventory_id})))
