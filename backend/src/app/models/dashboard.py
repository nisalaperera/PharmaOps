from pydantic import BaseModel
from typing import Optional


class RecentSale(BaseModel):
    id:             str
    customer_name:  str = ""
    total_amount:   float = 0
    payment_method: str = ""
    created_at:     Optional[str] = None


class BranchSummary(BaseModel):
    branch_id:        str
    branch_name:      str
    today_sales:      float = 0
    low_stock_count:  int = 0
    expiring_count:   int = 0
    pending_po_count: int = 0


class DashboardStats(BaseModel):
    total_branches:   int = 0
    today_sales:      float = 0
    month_sales:      float = 0
    low_stock_count:  int = 0
    expiring_count:   int = 0
    pending_po_count: int = 0
    recent_sales:     list[RecentSale] = []
    branch_summaries: list[BranchSummary] = []


class RevenueTrendPoint(BaseModel):
    date:   str
    amount: float = 0
    count:  int = 0


class TopProduct(BaseModel):
    product_name: str
    total_qty:    int = 0
    total_amount: float = 0


class PaymentBreakdown(BaseModel):
    method: str
    count:  int = 0
    amount: float = 0


class DashboardCharts(BaseModel):
    revenue_trend:     list[RevenueTrendPoint] = []
    top_products:      list[TopProduct] = []
    payment_breakdown: list[PaymentBreakdown] = []
