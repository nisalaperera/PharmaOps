from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from typing import Optional
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.models.stock_transfer import StockTransferCreate, StockTransferResponse, TransferReceivePayload
from app.models.common import PaginatedResponse
from app.utils.notify import notify_branch_users
from app.utils.branch_scope import BRANCH_LEVEL_ROLES, enforce_branch_on_create
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.sequences import generate_document_number, get_branch_code
from app.utils.inventory_stock import batch_qty, set_batch_qty, inventory_totals, find_inventory_with_batch, find_or_create_inventory

router = APIRouter(prefix="/inventory/stock-transfers", tags=["Inventory"])

VALID_SORT_FIELDS = {"created_at", "status", "source_branch_name", "destination_branch_name"}


def _ensure_transfer_branch_access(transfer: dict, current_user: dict) -> None:
    if current_user["role"] not in BRANCH_LEVEL_ROLES:
        return
    user_branch = current_user["branch_id"]
    if transfer.get("source_branch_id") != user_branch and transfer.get("destination_branch_id") != user_branch:
        raise HTTPException(status_code=404, detail="Not found")


def _resolve_transfer(data: dict, db) -> dict:
    for branch_field, name_field in [
        ("source_branch_id", "source_branch_name"),
        ("destination_branch_id", "destination_branch_name"),
    ]:
        branch_id = data.get(branch_field)
        if branch_id and not data.get(name_field):
            branch = db[Collections.BRANCHES].find_one({"_id": branch_id}, {"name": 1})
            if branch:
                data[name_field] = branch["name"]
    for item in data.get("items", []):
        if item.get("product_id") and not item.get("product_name"):
            product = db[Collections.PRODUCTS].find_one({"_id": item["product_id"]}, {"name": 1})
            if product:
                item["product_name"] = product["name"]
    return data


def _log_transfer_movement(db, current_user, branch_id, items, movement_type, transfer_id, reference_value=""):
    from app.utils.stock_log import log_inventory
    for item in items:
        log_inventory(
            db, current_user,
            branch_id=branch_id,
            product_id=item.get("product_id", ""),
            batch_number=item.get("batch_number", ""),
            quantity=item.get("quantity", 0) if movement_type == "TRANSFER_OUT" else item.get("received_quantity", 0),
            movement_type=movement_type,
            reference_id=transfer_id,
            reference_type="transfer",
            reference_value=reference_value,
        )


def _deduct_source_inventory(db, source_branch_id, items, current_user):
    for item in items:
        inv_doc, batch = find_inventory_with_batch(db, item.get("product_id"), source_branch_id, item.get("batch_number"))
        if not inv_doc:
            raise HTTPException(status_code=400, detail=f"No inventory for product '{item.get('product_name', item.get('product_id'))}' in source branch")
        if not batch:
            raise HTTPException(status_code=400, detail=f"Batch '{item.get('batch_number')}' not found for product '{item.get('product_name', '')}'")
        available = batch_qty(batch)
        if item["quantity"] > available:
            raise HTTPException(status_code=400, detail=f"Insufficient stock in batch '{item.get('batch_number')}': requested {item['quantity']}, available {available}")

        set_batch_qty(batch, available - item["quantity"])
        batches = [b for b in inv_doc.get("batches", []) if batch_qty(b) > 0]
        db[Collections.INVENTORY].update_one(
            {"_id": inv_doc["_id"]},
            {"$set": {**inventory_totals(inv_doc, batches), **audit_update_fields(current_user)}},
        )


def _add_destination_inventory(db, dest_branch_id, source_branch_id, items, current_user):
    for item in items:
        recv_qty = item.get("received_quantity", 0)
        if recv_qty <= 0:
            continue

        _, source_batch = find_inventory_with_batch(db, item.get("product_id"), source_branch_id, item.get("batch_number"))

        dest_inv = find_or_create_inventory(
            db, current_user,
            product_id=item.get("product_id"), branch_id=dest_branch_id,
            product_name=item.get("product_name", ""),
        )
        now = datetime.now(timezone.utc).isoformat()

        batches = list(dest_inv.get("batches", []))
        existing = next((b for b in batches if b["batch_number"] == item.get("batch_number")), None)
        if existing:
            set_batch_qty(existing, batch_qty(existing) + recv_qty)
        else:
            new_batch = {
                "batch_number":   item.get("batch_number"),
                "expiry_date":    source_batch.get("expiry_date", "") if source_batch else "",
                "basic_sku_quantity": recv_qty,
                "sku":            source_batch.get("sku", "") if source_batch else "",
                "purchase_price": source_batch.get("purchase_price", 0) if source_batch else 0,
                "selling_price":  source_batch.get("selling_price", 0) if source_batch else 0,
                "basic_sku_purchase_price": source_batch.get("basic_sku_purchase_price", source_batch.get("purchase_price", 0)) if source_batch else 0,
                "basic_sku_selling_price":  source_batch.get("basic_sku_selling_price", source_batch.get("selling_price", 0)) if source_batch else 0,
                "supplier_id":    source_batch.get("supplier_id", "") if source_batch else "",
                "supplier_name":  source_batch.get("supplier_name", "") if source_batch else "",
                "received_date":  now[:10],
            }
            batches.append(new_batch)

        db[Collections.INVENTORY].update_one(
            {"_id": dest_inv["_id"]},
            {"$set": {**inventory_totals(dest_inv, batches), **audit_update_fields(current_user)}},
        )


@router.get("", response_model=PaginatedResponse[StockTransferResponse])
async def list_transfers(
    page:      int            = Query(default=1, ge=1),
    page_size: int            = Query(default=20, ge=1, le=100),
    status:    Optional[str]  = Query(default=None),
    sort_by:   Optional[str]  = Query(default="created_at"),
    sort_dir:  Optional[str]  = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db    = get_db()
    flt: dict = {}
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        user_branch = current_user["branch_id"]
        flt["$or"] = [{"source_branch_id": user_branch}, {"destination_branch_id": user_branch}]
    if status:
        flt["status"] = status

    sort_field = sort_by if sort_by in VALID_SORT_FIELDS else "created_at"
    sort_order = 1 if sort_dir == "asc" else -1
    total = db[Collections.STOCK_TRANSFERS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.STOCK_TRANSFERS].find(flt).sort(sort_field, sort_order).skip(skip).limit(page_size)
    items = [StockTransferResponse(**_resolve_transfer(doc_to_dict(d), db)) for d in docs]

    return PaginatedResponse[StockTransferResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=StockTransferResponse, status_code=201)
async def create_transfer(
    payload: StockTransferCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    payload.source_branch_id = enforce_branch_on_create(payload.source_branch_id, current_user)

    if payload.source_branch_id == payload.destination_branch_id:
        raise HTTPException(status_code=400, detail="Source and destination branches must be different")

    branch_code     = get_branch_code(db, payload.source_branch_id)
    transfer_number = generate_document_number(db, branch_code, "ST")

    data = {
        "_id": doc_id, "transfer_number": transfer_number, **payload.model_dump(),
        "status": "PENDING", "initiated_by": current_user["id"],
        "created_at": now, "updated_at": now,
        **audit_create_fields(current_user),
    }
    _resolve_transfer(data, db)
    db[Collections.STOCK_TRANSFERS].insert_one(data)

    item_count = len(data.get("items", []))
    notify_branch_users(
        db, branch_id=data["destination_branch_id"],
        type="TRANSFER_REQUEST", title="Incoming stock transfer",
        message=f"Stock transfer from {data.get('source_branch_name', 'another branch')} with {item_count} item(s) awaits dispatch.",
        action_url="/inventory/stock-transfers",
        exclude_user_id=current_user["id"],
    )
    return StockTransferResponse(**doc_to_dict(data))


@router.post("/{transfer_id}/dispatch", response_model=StockTransferResponse)
async def dispatch_transfer(
    transfer_id: str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    _ensure_transfer_branch_access(doc_to_dict(existing), current_user)
    if existing["status"] not in ("PENDING", "CONFIRMED"):
        raise HTTPException(status_code=400, detail="Only PENDING or CONFIRMED transfers can be dispatched")
    # Only the sending branch may dispatch.
    if current_user["role"] in BRANCH_LEVEL_ROLES and current_user["branch_id"] != existing["source_branch_id"]:
        raise HTTPException(status_code=403, detail="Only the source branch can dispatch this transfer")

    items = existing.get("items", [])
    _deduct_source_inventory(db, existing["source_branch_id"], items, current_user)
    _log_transfer_movement(db, current_user, existing["source_branch_id"], items, "TRANSFER_OUT", transfer_id, reference_value=existing.get("transfer_number", ""))

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {
            "status": "IN_TRANSIT",
            "dispatched_by": current_user["id"],
            "dispatched_at": now,
            "updated_at": now,
            **audit_update_fields(current_user),
        }},
    )
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))


@router.post("/{transfer_id}/receive", response_model=StockTransferResponse)
async def receive_transfer(
    transfer_id: str,
    payload: TransferReceivePayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    _ensure_transfer_branch_access(doc_to_dict(existing), current_user)
    if existing["status"] not in ("IN_TRANSIT", "PARTIALLY_RECEIVED"):
        raise HTTPException(status_code=400, detail="Only IN_TRANSIT or PARTIALLY_RECEIVED transfers can be received")
    # Only the receiving branch may receive.
    if current_user["role"] in BRANCH_LEVEL_ROLES and current_user["branch_id"] != existing["destination_branch_id"]:
        raise HTTPException(status_code=403, detail="Only the destination branch can receive this transfer")

    items = list(existing.get("items", []))
    recv_map = {(r.product_id, r.batch_number): r.received_quantity for r in payload.items}

    receive_items = []
    for item in items:
        key = (item["product_id"], item["batch_number"])
        if key in recv_map:
            qty = recv_map[key]
            if qty <= 0:
                continue
            remaining = item["quantity"] - item.get("received_quantity", 0)
            if qty > remaining:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot receive {qty} of batch '{item['batch_number']}': only {max(0, remaining)} remaining on this transfer",
                )
            item["received_quantity"] = item.get("received_quantity", 0) + qty
            receive_items.append({"product_id": item["product_id"], "product_name": item.get("product_name", ""), "batch_number": item["batch_number"], "received_quantity": qty})

    _add_destination_inventory(db, existing["destination_branch_id"], existing["source_branch_id"], receive_items, current_user)
    _log_transfer_movement(db, current_user, existing["destination_branch_id"], receive_items, "TRANSFER_IN", transfer_id, reference_value=existing.get("transfer_number", ""))

    all_received = all(item.get("received_quantity", 0) >= item["quantity"] for item in items)
    new_status = "RECEIVED" if all_received else "PARTIALLY_RECEIVED"

    now = datetime.now(timezone.utc).isoformat()
    update_set = {
        "status": new_status, "items": items, "updated_at": now,
        "received_by": current_user["id"], "received_at": now,
        **audit_update_fields(current_user),
    }
    db[Collections.STOCK_TRANSFERS].update_one({"_id": transfer_id}, {"$set": update_set})
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))


@router.post("/{transfer_id}/confirm", response_model=StockTransferResponse)
async def confirm_transfer(
    transfer_id: str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    _ensure_transfer_branch_access(doc_to_dict(existing), current_user)
    if existing["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Only PENDING transfers can be confirmed")
    now = datetime.now(timezone.utc).isoformat()
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "CONFIRMED", "confirmed_by": current_user["id"], "confirmed_at": now, "updated_at": now, **audit_update_fields(current_user)}},
    )
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))


@router.post("/{transfer_id}/reject", response_model=StockTransferResponse)
async def reject_transfer(
    transfer_id: str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    _ensure_transfer_branch_access(doc_to_dict(existing), current_user)
    if existing["status"] not in ("PENDING", "CONFIRMED", "IN_TRANSIT", "PARTIALLY_RECEIVED"):
        raise HTTPException(status_code=400, detail="Only PENDING, CONFIRMED, IN_TRANSIT or PARTIALLY_RECEIVED transfers can be rejected")

    if existing["status"] in ("IN_TRANSIT", "PARTIALLY_RECEIVED"):
        # Restore the un-received remainder to the source branch.
        for item in existing.get("items", []):
            restore_qty = item["quantity"] - item.get("received_quantity", 0)
            if restore_qty <= 0:
                continue
            inv_doc = find_or_create_inventory(
                db, current_user,
                product_id=item["product_id"], branch_id=existing["source_branch_id"],
                product_name=item.get("product_name", ""),
            )
            batches = list(inv_doc.get("batches", []))
            batch = next((b for b in batches if b["batch_number"] == item["batch_number"]), None)
            if batch:
                set_batch_qty(batch, batch_qty(batch) + restore_qty)
            else:
                batches.append({"batch_number": item["batch_number"], "expiry_date": "", "basic_sku_quantity": restore_qty, "sku": "", "purchase_price": 0, "selling_price": 0, "supplier_id": "", "supplier_name": "", "received_date": ""})
            db[Collections.INVENTORY].update_one({"_id": inv_doc["_id"]}, {"$set": inventory_totals(inv_doc, batches)})

    now = datetime.now(timezone.utc).isoformat()
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "REJECTED", "updated_at": now, **audit_update_fields(current_user)}},
    )
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))


@router.post("/{transfer_id}/cancel", response_model=StockTransferResponse)
async def cancel_transfer(
    transfer_id: str,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    existing = db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Transfer not found")
    _ensure_transfer_branch_access(doc_to_dict(existing), current_user)
    if existing["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Only PENDING transfers can be cancelled")
    db[Collections.STOCK_TRANSFERS].update_one(
        {"_id": transfer_id},
        {"$set": {"status": "CANCELLED", "updated_at": datetime.now(timezone.utc).isoformat(), **audit_update_fields(current_user)}},
    )
    return StockTransferResponse(**_resolve_transfer(doc_to_dict(db[Collections.STOCK_TRANSFERS].find_one({"_id": transfer_id})), db))
