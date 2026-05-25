from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

POStatus                     = Literal["DRAFT","PENDING_APPROVAL","APPROVED","SENT","PARTIAL","RECEIVED","CANCELLED"]
PurchaseInvoiceStatus        = Literal["PENDING","COMPLETED","PARTIAL"]
PurchaseInvoicePaymentStatus = Literal["UNPAID","PARTIALLY_PAID","PAID"]


class POItem(BaseModel):
    product_id:   str
    product_name: str = ""
    quantity:     int = Field(ge=1)
    unit_price:   float = Field(ge=0)
    total_price:  float = 0


class PurchaseOrderBase(BaseModel):
    branch_id:    str
    supplier_id:  str
    channel_id:   str
    items:        list[POItem]
    notes:        Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase): pass


class PurchaseOrderUpdate(BaseModel):
    items:  Optional[list[POItem]] = None
    notes:  Optional[str] = None
    status: Optional[POStatus] = None


class PurchaseOrderResponse(PurchaseOrderBase, TimestampMixin):
    id:               str
    supplier_name:    str = ""
    channel_name:     str = ""
    credit_term_days: int = 30
    total_amount:     float = 0
    status:           POStatus = "DRAFT"
    created_by:       str
    approved_by:      Optional[str] = None
    approved_at:      Optional[str] = None


# ─── Purchase Invoice (formerly GRN) ─────────────────────────────────────────

class PurchaseInvoiceItem(BaseModel):
    product_id:         str
    product_name:       str = ""
    ordered_quantity:   int
    received_quantity:  int = Field(ge=0)
    batch_number:       str
    expiry_date:        str
    unit_price:         float = Field(ge=0)


class PaymentEntry(BaseModel):
    amount:         float = Field(ge=0)
    payment_date:   str
    payment_method: Literal["CASH","CARD","BANK_TRANSFER","CHEQUE"]


class PurchaseInvoiceCreate(BaseModel):
    purchase_order_id:    str
    branch_id:            str
    supplier_id:          str
    channel_id:           str
    items:                list[PurchaseInvoiceItem]
    invoice_date:         str
    supplier_invoice_ref: Optional[str] = None
    notes:                Optional[str] = None


class PurchaseInvoiceResponse(PurchaseInvoiceCreate, TimestampMixin):
    id:               str
    invoice_number:   str = ""
    status:           PurchaseInvoiceStatus        = "PENDING"
    payment_status:   PurchaseInvoicePaymentStatus = "UNPAID"
    payment_entries:  list[PaymentEntry]           = []
    received_by:      str
    received_at:      str
    supplier_name:    str = ""
    channel_name:     str = ""
    credit_term_days: int = 30


# ─── Backwards-compat aliases used by existing frontend/API code ──────────────
GRNStatus = PurchaseInvoiceStatus
GRNItem   = PurchaseInvoiceItem
GRNCreate = PurchaseInvoiceCreate


class GRNResponse(PurchaseInvoiceResponse): pass
