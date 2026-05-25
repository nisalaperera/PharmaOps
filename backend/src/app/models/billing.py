from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

CreditPaymentMethod = Literal["CASH", "CARD", "BANK_TRANSFER", "CHEQUE"]


class CreditPaymentCreate(BaseModel):
    customer_id:    str
    sale_id:        Optional[str]       = None
    amount:         float               = Field(gt=0)
    payment_method: CreditPaymentMethod = "CASH"
    notes:          Optional[str]       = None
    branch_id:      str


class CreditPaymentResponse(CreditPaymentCreate, TimestampMixin):
    id:            str
    customer_name: str = ""
    cashier_id:    str = ""
    cashier_name:  str = ""
