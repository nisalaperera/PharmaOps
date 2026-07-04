"""
Shared helpers for reading and mutating inventory batch stock.

Inventory batches historically stored quantity under two field names:
``quantity`` (legacy) and ``basic_sku_quantity`` (current, in basic-SKU
units). Inventory documents are also keyed two ways: legacy docs by
``{product_id, branch_id}`` and current docs by
``{product_id, branch_id, basic_sku}``. Every module that touches stock
must go through these helpers so both shapes stay consistent and
``total_quantity`` / ``is_low_stock`` are always maintained.
"""
from datetime import datetime, timezone
from app.core.database import Collections, new_id
from app.utils.audit import audit_create_fields


def batch_qty(batch: dict) -> int:
    """Quantity of a batch regardless of which field name it uses."""
    if "basic_sku_quantity" in batch:
        return batch.get("basic_sku_quantity", 0) or 0
    return batch.get("quantity", 0) or 0


def set_batch_qty(batch: dict, value: int) -> None:
    """Write a batch quantity, keeping both field names in sync if present."""
    batch["basic_sku_quantity"] = value
    if "quantity" in batch:
        batch["quantity"] = value


def inventory_totals(inv_doc: dict, batches: list[dict]) -> dict:
    """Build the $set fields for batches + recomputed totals/low-stock flag."""
    total_qty = sum(batch_qty(b) for b in batches)
    return {
        "batches":        batches,
        "total_quantity": total_qty,
        "is_low_stock":   total_qty <= (inv_doc.get("min_stock_level", 0) or 0),
        "updated_at":     datetime.now(timezone.utc).isoformat(),
    }


def find_inventory_with_batch(db, product_id: str, branch_id: str, batch_number: str):
    """Locate the inventory doc (among possibly several for the same
    product/branch) whose batches contain ``batch_number``.

    Returns (inv_doc, batch) or (None, None).
    """
    for inv in db[Collections.INVENTORY].find({"product_id": product_id, "branch_id": branch_id}):
        for b in inv.get("batches", []):
            if b.get("batch_number") == batch_number:
                return inv, b
    return None, None


def find_or_create_inventory(
    db, current_user: dict, *,
    product_id: str, branch_id: str,
    basic_sku_name: str = "", basic_sku_id: str = "",
    product_name: str = "",
) -> dict:
    """Find the inventory doc for a product/branch (preferring a basic-SKU
    match, then a legacy doc without ``basic_sku``), creating one if none
    exists. Prevents duplicate docs for the same product/branch."""
    docs = list(db[Collections.INVENTORY].find({"product_id": product_id, "branch_id": branch_id}))
    if basic_sku_name:
        for d in docs:
            if d.get("basic_sku") == basic_sku_name:
                return d
    for d in docs:
        if not d.get("basic_sku"):
            return d
    if docs:
        return docs[0]

    now = datetime.now(timezone.utc).isoformat()
    if not product_name:
        product = db[Collections.PRODUCTS].find_one({"_id": product_id}, {"name": 1})
        product_name = product.get("name", "") if product else ""
    inv = {
        "_id":             new_id(),
        "branch_id":       branch_id,
        "product_id":      product_id,
        "product_name":    product_name,
        "basic_sku":       basic_sku_name,
        "basic_sku_id":    basic_sku_id,
        "batches":         [],
        "total_quantity":  0,
        "min_stock_level": 0,
        "is_low_stock":    False,
        "created_at":      now,
        "updated_at":      now,
        **audit_create_fields(current_user),
    }
    db[Collections.INVENTORY].insert_one(inv)
    return inv


def resolve_basic_sku_count(product_doc: dict | None, sku_name: str) -> int:
    """How many basic-SKU units one unit of ``sku_name`` represents."""
    if not product_doc or not sku_name:
        return 1
    if sku_name == product_doc.get("basic_sku_name", ""):
        return 1
    for m in product_doc.get("sku_mappings", []):
        if m.get("sku") == sku_name:
            return m.get("basic_sku_count", 1) or 1
    return 1
