from fastapi import APIRouter, Depends, Query
from app.core.database import get_db, Collections
from app.middleware.auth_middleware import require_min_role

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/sales-summary")
async def sales_summary(
    branch_id: str | None = Query(default=None),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}
    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER")
        else branch_id
    )
    if effective_branch: filter["branch_id"] = effective_branch

    docs           = list(db[Collections.SALES].find(filter))
    total_amount   = sum(d.get("total_amount", 0) for d in docs)
    payment_totals: dict[str, float] = {}
    for doc in docs:
        method = doc.get("payment_method", "UNKNOWN")
        payment_totals[method] = payment_totals.get(method, 0) + doc.get("total_amount", 0)

    return {"total_amount": total_amount, "sale_count": len(docs), "payment_totals": payment_totals}


@router.get("/stock-valuation")
async def stock_valuation(
    branch_id: str | None = Query(default=None),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db     = get_db()
    filter = {}
    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER")
        else branch_id
    )
    if effective_branch: filter["branch_id"] = effective_branch

    docs        = list(db[Collections.INVENTORY].find(filter))
    total_value = 0.0
    items       = []
    for doc in docs:
        batches    = doc.get("batches", [])
        item_value = sum(b.get("quantity", 0) * b.get("purchase_price", 0) for b in batches)
        total_value += item_value
        items.append({"product_id": str(doc["_id"]), "product_name": doc.get("product_name", ""), "value": item_value})

    return {"total_value": total_value, "low_stock_count": sum(1 for d in docs if d.get("is_low_stock")), "items": items}


@router.get("/expiry-report")
async def expiry_report(
    branch_id:      str | None = Query(default=None),
    days_threshold: int        = Query(default=30, ge=1),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) + timedelta(days=days_threshold)).isoformat()[:10]

    db     = get_db()
    filter = {}
    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER")
        else branch_id
    )
    if effective_branch: filter["branch_id"] = effective_branch

    docs     = list(db[Collections.INVENTORY].find(filter))
    expiring = []
    for doc in docs:
        for batch in doc.get("batches", []):
            expiry = batch.get("expiry_date", "")
            if expiry and expiry <= cutoff and batch.get("quantity", 0) > 0:
                expiring.append({
                    "product_name": doc.get("product_name"),
                    "branch_id":    doc.get("branch_id"),
                    "batch_number": batch.get("batch_number"),
                    "expiry_date":  expiry,
                    "quantity":     batch.get("quantity"),
                })

    return {"expiring_items": sorted(expiring, key=lambda x: x["expiry_date"])}
