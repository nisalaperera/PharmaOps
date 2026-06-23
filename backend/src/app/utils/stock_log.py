from datetime import datetime, timezone
from app.core.database import Collections, new_id
from app.utils.audit import audit_create_fields


def log_stock_movement(
    db, current_user: dict, *,
    branch_id: str, product_id: str, product_name: str,
    batch_number: str, quantity: int, movement_type: str,
    reason: str | None = None, notes: str | None = None,
    reference_id: str | None = None, reference_type: str | None = None,
    expiry_date: str | None = None,
    sku: str | None = None,
    purchase_price: float | None = None,
    selling_price: float | None = None,
    basic_sku: str | None = None,
    basic_sku_count: int | None = None,
    basic_sku_quantity: int | None = None,
    basic_sku_selling_price: float | None = None,
    basic_sku_purchase_price: float | None = None,
    stock_location_id: str | None = None,
):
    now = datetime.now(timezone.utc).isoformat()
    db[Collections.STOCK_MOVEMENT_LOGS].insert_one({
        "_id":                    new_id(),
        "branch_id":              branch_id,
        "product_id":             product_id,
        "product_name":           product_name,
        "batch_number":           batch_number,
        "expiry_date":            expiry_date,
        "sku":                    sku,
        "quantity":               quantity,
        "purchase_price":         purchase_price,
        "selling_price":          selling_price,
        "basic_sku":              basic_sku,
        "basic_sku_count":        basic_sku_count,
        "basic_sku_quantity":     basic_sku_quantity,
        "basic_sku_selling_price":  basic_sku_selling_price,
        "basic_sku_purchase_price": basic_sku_purchase_price,
        "stock_location_id":      stock_location_id,
        "movement_type":          movement_type,
        "reason":                 reason,
        "notes":                  notes,
        "reference_id":           reference_id,
        "reference_type":         reference_type,
        "created_at":             now,
        "updated_at":             now,
        **audit_create_fields(current_user),
    })
