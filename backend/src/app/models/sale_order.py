from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin
from app.models.sale import PaymentMethod, ChequeDetails

SalesOrderStatus = Literal["DRAFT", "CONFIRMED", "INVOICED", "CANCELLED"]


class SalesOrderItem(BaseModel):
    product_id:      str
    product_name:    str = ""
    quantity:        int = Field(ge=1)
    unit_price:      float = Field(ge=0)
    discount:        float = Field(default=0, ge=0)
    total_price:     float = 0
    prescription_id: Optional[str] = None


class SalesOrderCreate(BaseModel):
    branch_id:   str
    customer_id: Optional[str] = None
    items:       list[SalesOrderItem]
    notes:       Optional[str] = None


class SalesOrderUpdate(BaseModel):
    customer_id: Optional[str] = None
    items:       Optional[list[SalesOrderItem]] = None
    notes:       Optional[str] = None


class SalesOrderResponse(SalesOrderCreate, TimestampMixin):
    id:             str
    customer_name:  str = ""
    subtotal:       float = 0
    discount_total: float = 0
    total_amount:   float = 0
    status:         SalesOrderStatus = "DRAFT"
    created_by:     str
    created_by_name: str = ""
    confirmed_at:   Optional[str] = None
    invoiced_at:    Optional[str] = None
    cancelled_at:   Optional[str] = None
    sale_id:        Optional[str] = None


class ConvertToInvoiceRequest(BaseModel):
    payment_method:  PaymentMethod
    paid_amount:     float = Field(ge=0)
    invoice_date:    str
    cheque_details:  Optional[ChequeDetails] = None


class QuotationPdfRequest(BaseModel):
    validity_days: int = Field(default=30, ge=1)
    notes:         Optional[str] = None
