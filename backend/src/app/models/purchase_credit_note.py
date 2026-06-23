from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import AuditMixin

CreditNoteStatus = Literal["DRAFT", "APPROVED", "APPLIED", "CANCELLED"]


class CreditNoteItem(BaseModel):
    product_id:            str
    product_name:          str = ""
    batch_number:          str
    expiry_date:           str = ""
    quantity:              int   = Field(ge=1)
    unit_price:            float = Field(ge=0)
    line_total:            float = 0
    source_invoice_id:     Optional[str] = None
    return_policy_warning: Optional[str] = None


class PurchaseCreditNoteBase(BaseModel):
    branch_id:        str
    supplier_id:      str
    channel_id:       Optional[str] = None
    credit_note_date: str
    items:            list[CreditNoteItem]
    notes:            Optional[str] = None


class PurchaseCreditNoteCreate(PurchaseCreditNoteBase):
    pass


class PurchaseCreditNoteUpdate(BaseModel):
    credit_note_date: Optional[str] = None
    items:            Optional[list[CreditNoteItem]] = None
    notes:            Optional[str] = None


class PurchaseCreditNoteResponse(PurchaseCreditNoteBase, AuditMixin):
    id:                 str
    credit_note_number: str = ""
    supplier_name:      str = ""
    channel_name:       str = ""
    total_amount:       float = 0
    status:             CreditNoteStatus = "DRAFT"
    applied_payment_id: Optional[str] = None
    applied_at:         Optional[str] = None
    inventory_deducted: bool = False
