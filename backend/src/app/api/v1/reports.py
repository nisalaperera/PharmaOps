from fastapi import APIRouter, Depends, Query
from app.core.database import get_db, Collections
from app.middleware.auth_middleware import require_min_role

router = APIRouter(prefix="/reports", tags=["Reports"])

BRANCH_LEVEL_ROLES = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}


def _effective_branch(current_user: dict, branch_id: str | None) -> str | None:
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        return current_user["branch_id"]
    return branch_id or None


# ── Sales Summary ─────────────────────────────────────────────────────────────

@router.get("/sales-summary")
async def sales_summary(
    branch_id:  str | None = Query(default=None),
    date_from:  str | None = Query(default=None, description="yyyy-MM-dd"),
    date_to:    str | None = Query(default=None, description="yyyy-MM-dd"),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db  = get_db()
    flt: dict = {}

    branch = _effective_branch(current_user, branch_id)
    if branch:
        flt["branch_id"] = branch

    date_filter: dict = {}
    if date_from: date_filter["$gte"] = date_from
    if date_to:   date_filter["$lte"] = date_to + "T23:59:59"
    if date_filter:
        flt["created_at"] = date_filter

    docs = list(db[Collections.SALES].find(flt))

    total_amount   = sum(d.get("total_amount", 0) for d in docs)
    payment_totals: dict[str, float] = {}
    for doc in docs:
        method = doc.get("payment_method", "UNKNOWN")
        payment_totals[method] = payment_totals.get(method, 0) + doc.get("total_amount", 0)

    return {
        "total_amount":   total_amount,
        "sale_count":     len(docs),
        "payment_totals": payment_totals,
    }


# ── Stock Valuation ───────────────────────────────────────────────────────────

@router.get("/stock-valuation")
async def stock_valuation(
    branch_id:    str | None = Query(default=None),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    db  = get_db()
    flt: dict = {}

    branch = _effective_branch(current_user, branch_id)
    if branch:
        flt["branch_id"] = branch

    docs        = list(db[Collections.INVENTORY].find(flt))
    total_value = 0.0
    items       = []
    for doc in docs:
        batches    = doc.get("batches", [])
        item_value = sum(
            b.get("quantity", 0) * b.get("purchase_price", 0) for b in batches
        )
        total_value += item_value
        items.append({
            "product_id":   str(doc["_id"]),
            "product_name": doc.get("product_name", ""),
            "branch_id":    doc.get("branch_id", ""),
            "total_qty":    sum(b.get("quantity", 0) for b in batches),
            "value":        item_value,
        })

    items.sort(key=lambda x: x["value"], reverse=True)

    return {
        "total_value":    total_value,
        "item_count":     len(docs),
        "low_stock_count": sum(1 for d in docs if d.get("is_low_stock")),
        "items":          items,
    }


# ── Expiry Report ─────────────────────────────────────────────────────────────

@router.get("/expiry-report")
async def expiry_report(
    branch_id:      str | None = Query(default=None),
    days_threshold: int        = Query(default=30, ge=1, le=365),
    current_user: dict = Depends(require_min_role("BRANCH_ADMIN")),
):
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) + timedelta(days=days_threshold)).isoformat()[:10]

    db  = get_db()
    flt: dict = {}

    branch = _effective_branch(current_user, branch_id)
    if branch:
        flt["branch_id"] = branch

    docs     = list(db[Collections.INVENTORY].find(flt))
    expiring = []
    for doc in docs:
        for batch in doc.get("batches", []):
            expiry = batch.get("expiry_date", "")
            if expiry and expiry <= cutoff and batch.get("quantity", 0) > 0:
                expiring.append({
                    "product_name": doc.get("product_name", ""),
                    "branch_id":    doc.get("branch_id", ""),
                    "batch_number": batch.get("batch_number", ""),
                    "expiry_date":  expiry,
                    "quantity":     batch.get("quantity", 0),
                })

    return {
        "expiring_count": len(expiring),
        "expiring_items": sorted(expiring, key=lambda x: x["expiry_date"]),
    }
