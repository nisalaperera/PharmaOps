from fastapi import HTTPException
from app.core.database import Collections
from app.utils.stock_log import log_inventory
from app.utils.inventory_stock import (
    batch_qty, set_batch_qty, inventory_totals,
    find_inventory_with_batch, find_or_create_inventory, resolve_basic_sku_count,
)


def _item_basic_qty(db, item: dict) -> int:
    """Return-item quantity converted to basic-SKU units."""
    qty = item.get("quantity", 0)
    sku = item.get("sku", "")
    if not sku:
        return qty
    product = db[Collections.PRODUCTS].find_one(
        {"_id": item["product_id"]}, {"basic_sku_name": 1, "sku_mappings": 1}
    )
    return qty * resolve_basic_sku_count(product, sku)


def deduct_return_stock(db, current_user: dict, ret: dict) -> None:
    """Remove a return's quantities from branch inventory (stock leaves on invoice create)."""
    branch_id = ret["branch_id"]
    for item in ret.get("items", []):
        qty = item.get("quantity", 0)
        if qty <= 0:
            continue
        basic_qty = _item_basic_qty(db, item)
        inv, batch = find_inventory_with_batch(db, item["product_id"], branch_id, item["batch_number"])
        if not inv or not batch:
            raise HTTPException(
                status_code=400,
                detail=f"Batch '{item['batch_number']}' of '{item.get('product_name', item['product_id'])}' not found in inventory",
            )
        available = batch_qty(batch)
        if basic_qty > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock in batch '{item['batch_number']}' of '{item.get('product_name', '')}': returning {basic_qty}, available {available}",
            )
        set_batch_qty(batch, available - basic_qty)
        batches = [b for b in inv.get("batches", []) if batch_qty(b) > 0]
        db[Collections.INVENTORY].update_one(
            {"_id": inv["_id"]},
            {"$set": inventory_totals(inv, batches)},
        )
        log_inventory(
            db, current_user, branch_id=branch_id, product_id=item["product_id"],
            batch_number=item["batch_number"], quantity=qty, movement_type="RETURN_OUT",
            expiry_date=item.get("expiry_date"), sku=item.get("sku"),
            basic_sku_quantity=basic_qty, purchase_price=item.get("unit_price"),
            reference_id=ret["_id"], reference_type="purchase_return", reference_value=ret.get("return_number"),
        )


def restore_return_stock(db, current_user: dict, ret: dict) -> None:
    """Add a return's quantities back into branch inventory (stock returns on reject)."""
    branch_id = ret["branch_id"]
    for item in ret.get("items", []):
        qty = item.get("quantity", 0)
        if qty <= 0:
            continue
        basic_qty = _item_basic_qty(db, item)
        inv = find_or_create_inventory(
            db, current_user,
            product_id=item["product_id"], branch_id=branch_id,
            product_name=item.get("product_name", ""),
        )
        batches  = list(inv.get("batches", []))
        existing = next((b for b in batches if b.get("batch_number") == item["batch_number"]), None)
        if existing:
            set_batch_qty(existing, batch_qty(existing) + basic_qty)
        else:
            batches.append({
                "batch_number":             item["batch_number"],
                "expiry_date":              item.get("expiry_date", ""),
                "basic_sku_quantity":       basic_qty,
                "sku":                      item.get("sku", ""),
                "purchase_price":           item.get("unit_price", 0),
                "selling_price":            item.get("unit_price", 0),
                "basic_sku_purchase_price": item.get("unit_price", 0),
                "basic_sku_selling_price":  item.get("unit_price", 0),
                "supplier_id":              ret.get("supplier_id", ""),
                "supplier_name":            ret.get("supplier_name", ""),
                "received_date":            inv.get("updated_at", "")[:10],
            })
        db[Collections.INVENTORY].update_one(
            {"_id": inv["_id"]},
            {"$set": inventory_totals(inv, batches)},
        )
        log_inventory(
            db, current_user, branch_id=branch_id, product_id=item["product_id"],
            batch_number=item["batch_number"], quantity=qty, movement_type="RETURN_IN",
            expiry_date=item.get("expiry_date"), sku=item.get("sku"),
            basic_sku_quantity=basic_qty, purchase_price=item.get("unit_price"),
            reference_id=ret["_id"], reference_type="purchase_return", reference_value=ret.get("return_number"),
        )
