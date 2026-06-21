from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
from app.core.database import get_db, Collections, doc_to_dict
from app.middleware.auth_middleware import get_current_user
from app.utils.branch_scope import BRANCH_LEVEL_ROLES
from app.models.dashboard import (
    DashboardStats, RecentSale, BranchSummary,
    DashboardCharts, RevenueTrendPoint, TopProduct, PaymentBreakdown,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

EXPIRY_DAYS_THRESHOLD = 30
RECENT_SALES_LIMIT    = 8


def _expiring_count(inventory_docs: list[dict], cutoff: str) -> int:
    count = 0
    for doc in inventory_docs:
        for batch in doc.get("batches", []):
            expiry = batch.get("expiry_date", "")
            if expiry and expiry <= cutoff and batch.get("quantity", 0) > 0:
                count += 1
    return count


# NOTE: Like reports.py, computations use plain find() + Python-side sums —
# no aggregation pipelines (DB may be Firestore via the PyMongo-compatible API).

@router.get("/stats", response_model=DashboardStats)
async def dashboard_stats(current_user: dict = Depends(get_current_user)):
    db  = get_db()
    now = datetime.now(timezone.utc)

    today       = now.date().isoformat()
    month_start = today[:8] + "01"
    cutoff      = (now + timedelta(days=EXPIRY_DAYS_THRESHOLD)).isoformat()[:10]

    is_branch_level = current_user["role"] in BRANCH_LEVEL_ROLES
    branch_flt: dict = {"branch_id": current_user["branch_id"]} if is_branch_level else {}

    # One month-range fetch covers both month and today totals
    month_sales_docs = list(db[Collections.SALES].find({
        **branch_flt,
        "created_at": {"$gte": month_start},
        "status":     {"$ne": "REFUNDED"},
    }))
    month_sales = sum(d.get("total_amount", 0) for d in month_sales_docs)
    today_sales = sum(
        d.get("total_amount", 0) for d in month_sales_docs
        if d.get("created_at", "") >= today
    )

    inventory_docs = list(db[Collections.INVENTORY].find(branch_flt))
    low_stock_count = sum(1 for d in inventory_docs if d.get("is_low_stock"))
    expiring_count  = _expiring_count(inventory_docs, cutoff)

    pending_po_count = db[Collections.PURCHASE_ORDERS].count_documents({
        **branch_flt,
        "status": "PENDING_APPROVAL",
    })

    recent_docs = (
        db[Collections.SALES].find(branch_flt).sort("created_at", -1).limit(RECENT_SALES_LIMIT)
    )
    recent_sales = []
    for doc in recent_docs:
        d = doc_to_dict(doc)
        recent_sales.append(RecentSale(
            id=d["id"],
            customer_name=d.get("customer_name", "") or "Walk-in",
            total_amount=d.get("total_amount", 0),
            payment_method=d.get("payment_method", ""),
            created_at=d.get("created_at"),
        ))

    total_branches   = 0
    branch_summaries = []
    if not is_branch_level:
        branch_docs    = list(db[Collections.BRANCHES].find({"is_active": True}))
        total_branches = len(branch_docs)

        # Group the already-fetched month sales by branch (avoids per-branch queries)
        today_sales_by_branch: dict[str, float] = {}
        for d in month_sales_docs:
            if d.get("created_at", "") >= today:
                bid = d.get("branch_id", "")
                today_sales_by_branch[bid] = today_sales_by_branch.get(bid, 0) + d.get("total_amount", 0)

        low_stock_by_branch: dict[str, int] = {}
        expiring_by_branch:  dict[str, int] = {}
        for doc in inventory_docs:
            bid = doc.get("branch_id", "")
            if doc.get("is_low_stock"):
                low_stock_by_branch[bid] = low_stock_by_branch.get(bid, 0) + 1
            expiring_by_branch[bid] = expiring_by_branch.get(bid, 0) + _expiring_count([doc], cutoff)

        for branch_doc in branch_docs:
            branch = doc_to_dict(branch_doc)
            bid    = branch["id"]
            branch_summaries.append(BranchSummary(
                branch_id=bid,
                branch_name=branch.get("name", ""),
                today_sales=today_sales_by_branch.get(bid, 0),
                low_stock_count=low_stock_by_branch.get(bid, 0),
                expiring_count=expiring_by_branch.get(bid, 0),
                pending_po_count=db[Collections.PURCHASE_ORDERS].count_documents({
                    "branch_id": bid, "status": "PENDING_APPROVAL",
                }),
            ))

    return DashboardStats(
        total_branches=total_branches,
        today_sales=today_sales,
        month_sales=month_sales,
        low_stock_count=low_stock_count,
        expiring_count=expiring_count,
        pending_po_count=pending_po_count,
        recent_sales=recent_sales,
        branch_summaries=branch_summaries,
    )


TREND_DAYS        = 30
TOP_PRODUCTS_LIMIT = 10


@router.get("/charts", response_model=DashboardCharts)
async def dashboard_charts(current_user: dict = Depends(get_current_user)):
    db  = get_db()
    now = datetime.now(timezone.utc)

    is_branch_level = current_user["role"] in BRANCH_LEVEL_ROLES
    branch_flt: dict = {"branch_id": current_user["branch_id"]} if is_branch_level else {}

    trend_start = (now - timedelta(days=TREND_DAYS - 1)).date().isoformat()
    sales_docs  = list(db[Collections.SALES].find({
        **branch_flt,
        "created_at": {"$gte": trend_start},
        "status":     {"$ne": "REFUNDED"},
    }))

    # Revenue trend — daily buckets
    daily: dict[str, dict] = {}
    for i in range(TREND_DAYS):
        d = (now - timedelta(days=TREND_DAYS - 1 - i)).date().isoformat()
        daily[d] = {"amount": 0.0, "count": 0}

    for doc in sales_docs:
        day = doc.get("created_at", "")[:10]
        if day in daily:
            daily[day]["amount"] += doc.get("total_amount", 0)
            daily[day]["count"]  += 1

    revenue_trend = [
        RevenueTrendPoint(date=d, amount=round(v["amount"], 2), count=v["count"])
        for d, v in daily.items()
    ]

    # Top products — aggregate item quantities and revenue
    product_agg: dict[str, dict] = {}
    for doc in sales_docs:
        for item in doc.get("items", []):
            name = item.get("product_name", "Unknown")
            if name not in product_agg:
                product_agg[name] = {"total_qty": 0, "total_amount": 0.0}
            product_agg[name]["total_qty"]    += item.get("quantity", 0)
            product_agg[name]["total_amount"] += item.get("total_price", 0)

    top_products = sorted(
        [TopProduct(product_name=k, **v) for k, v in product_agg.items()],
        key=lambda p: p.total_amount,
        reverse=True,
    )[:TOP_PRODUCTS_LIMIT]

    # Payment method breakdown
    method_agg: dict[str, dict] = {}
    for doc in sales_docs:
        method = doc.get("payment_method", "OTHER")
        if method not in method_agg:
            method_agg[method] = {"count": 0, "amount": 0.0}
        method_agg[method]["count"]  += 1
        method_agg[method]["amount"] += doc.get("total_amount", 0)

    payment_breakdown = [
        PaymentBreakdown(method=k, count=v["count"], amount=round(v["amount"], 2))
        for k, v in method_agg.items()
    ]

    return DashboardCharts(
        revenue_trend=revenue_trend,
        top_products=top_products,
        payment_breakdown=payment_breakdown,
    )
