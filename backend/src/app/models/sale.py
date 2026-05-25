from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

PaymentMethod = Literal["CASH","CARD","BANK_TRANSFER","CREDIT","CHEQUE"]
SaleStatus    = Literal["COMPLETED","REFUNDED","PARTIAL_REFUND"]
ChequeStatus  = Literal["PENDING","CLEARED","BOUNCED"]
SaleSource    = Literal["POS","ORDER"]


class ChequeDetails(BaseModel):
    cheque_number:  str
    bank_name:      str
    clearance_date: str
    status:         ChequeStatus = "PENDING"


class SaleItem(BaseModel):
    product_id:      str
    product_name:    str = ""
    batch_number:    str
    quantity:        int = Field(ge=1)
    unit_price:      float = Field(ge=0)
    discount:        float = Field(default=0, ge=0)
    total_price:     float = 0
    prescription_id: Optional[str] = None


SaleSource = Literal["POS", "ORDER"]


class SaleCreate(BaseModel):
    branch_id:        str
    customer_id:      Optional[str] = None
    items:            list[SaleItem]
    payment_method:   PaymentMethod
    cheque_details:   Optional[ChequeDetails] = None
    paid_amount:      float = Field(ge=0)
    source:           SaleSource = "POS"
    sales_order_id:   Optional[str] = None


class SaleUpdate(BaseModel):
    status:        Optional[Literal["REFUNDED", "PARTIAL_REFUND"]] = None
    refund_amount: Optional[float] = Field(default=None, ge=0)


class SaleResponse(SaleCreate, TimestampMixin):
    id:              str
    customer_name:   str = ""
    subtotal:        float = 0
    discount_total:  float = 0
    total_amount:    float = 0
    change_amount:   float = 0
    refund_amount:   float = 0
    status:          SaleStatus = "COMPLETED"
    cashier_id:      str
    cashier_name:    str = ""
