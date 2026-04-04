from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

PaymentMethod = Literal["CASH","CARD","BANK_TRANSFER","CREDIT","CHEQUE"]
SaleStatus    = Literal["COMPLETED","REFUNDED","PARTIAL_REFUND"]
ChequeStatus  = Literal["PENDING","CLEARED","BOUNCED"]


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


class SaleCreate(BaseModel):
    branch_id:       str
    patient_id:      Optional[str] = None
    items:           list[SaleItem]
    payment_method:  PaymentMethod
    cheque_details:  Optional[ChequeDetails] = None
    paid_amount:     float = Field(ge=0)


class SaleResponse(SaleCreate, TimestampMixin):
    id:             str
    patient_name:   str = ""
    subtotal:       float = 0
    discount_total: float = 0
    total_amount:   float = 0
    change_amount:  float = 0
    status:         SaleStatus = "COMPLETED"
    cashier_id:     str
    cashier_name:   str = ""
