from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from app.models.common import AuditMixin

# ─── Enums / Literals ─────────────────────────────────────────────────────────

PurchaseInvoiceStatus        = Literal["DRAFT", "RECEIVED", "VERIFIED"]
PurchaseInvoicePaymentStatus = Literal["UNPAID", "PARTIALLY_PAID", "PAID"]
PurchasePaymentMethod        = Literal["CASH", "CHEQUE", "BANK_TRANSFER"]


# ─── Line items ───────────────────────────────────────────────────────────────

class PurchaseInvoiceItem(BaseModel):
    product_id:     str
    product_name:   str = ""
    sku:            str = ""
    batch_number:   str
    expiry_date:    str
    unit_quantity:  int   = Field(ge=1)
    free_quantity:  int   = Field(default=0, ge=0)
    discount:       float = Field(default=0, ge=0)
    unit_price:     float = Field(ge=0)
    selling_price:  float = Field(default=0, ge=0)
    line_total:     float = 0  # computed: unit_quantity * unit_price - discount


class PurchaseReturnItem(BaseModel):
    product_id:   str
    product_name: str = ""
    batch_number: str = ""
    quantity:     int   = Field(ge=1)
    unit_price:   float = Field(ge=0)
    line_total:   float = 0  # computed: quantity * unit_price


# ─── Payments ─────────────────────────────────────────────────────────────────

class PaymentEntry(BaseModel):
    """Allocation of a payment to a single invoice (embedded on the invoice)."""
    payment_id:     Optional[str] = None
    amount:         float = Field(gt=0)
    payment_date:   str
    payment_method: PurchasePaymentMethod
    reference:      Optional[str] = None  # cheque no / transfer ref


# ─── Invoice ──────────────────────────────────────────────────────────────────

class PurchaseInvoiceBase(BaseModel):
    branch_id:                str
    supplier_id:              str
    channel_id:               str
    invoice_date:             str
    purchase_order_id:        Optional[str] = None
    distributor_invoice_no:   Optional[str] = None
    distributor_invoice_date: Optional[str] = None
    items:                    list[PurchaseInvoiceItem] = []
    return_items:             list[PurchaseReturnItem]  = []
    # Used only when the corresponding list is empty (manual entry).
    manual_total_amount:      Optional[float] = Field(default=None, ge=0)
    manual_return_amount:     Optional[float] = Field(default=None, ge=0)
    notes:                    Optional[str] = None


class PurchaseInvoiceCreate(PurchaseInvoiceBase):
    status: PurchaseInvoiceStatus = "RECEIVED"


class PurchaseInvoiceUpdate(BaseModel):
    invoice_date:             Optional[str] = None
    supplier_id:              Optional[str] = None
    channel_id:               Optional[str] = None
    distributor_invoice_no:   Optional[str] = None
    distributor_invoice_date: Optional[str] = None
    items:                    Optional[list[PurchaseInvoiceItem]] = None
    return_items:             Optional[list[PurchaseReturnItem]]  = None
    manual_total_amount:      Optional[float] = None
    manual_return_amount:     Optional[float] = None
    notes:                    Optional[str] = None


class PurchaseInvoiceResponse(PurchaseInvoiceBase, AuditMixin):
    id:               str
    invoice_number:   str = ""
    supplier_name:    str = ""
    channel_name:     str = ""
    credit_term_days: int = 30
    total_amount:     float = 0
    return_amount:    float = 0
    net_amount:       float = 0  # total_amount - return_amount
    status:           PurchaseInvoiceStatus        = "RECEIVED"
    payment_status:   PurchaseInvoicePaymentStatus = "UNPAID"
    paid_amount:      float = 0
    payment_entries:  list[PaymentEntry]           = []
    verified_by:      Optional[str] = None
    verified_at:      Optional[str] = None
    inventory_posted: bool = False


# ─── Multi-invoice payment ────────────────────────────────────────────────────

class PaymentAllocation(BaseModel):
    invoice_id: str
    amount:     float = Field(gt=0)


class CreditNoteAllocation(BaseModel):
    credit_note_id: str
    amount:         float = Field(gt=0)


class PurchasePaymentCreate(BaseModel):
    payment_date:    str
    payment_method:  PurchasePaymentMethod
    reference:       Optional[str] = None
    allocations:     list[PaymentAllocation] = []
    credit_note_ids: list[str] = []

    @model_validator(mode="after")
    def validate_has_allocations(self):
        if not self.allocations and not self.credit_note_ids:
            raise ValueError("At least one invoice allocation or credit note is required")
        return self


class PurchasePaymentResponse(AuditMixin):
    id:                      str
    payment_date:            str
    payment_method:          PurchasePaymentMethod
    reference:               Optional[str] = None
    total_amount:            float = 0
    allocations:             list[PaymentAllocation] = []
    credit_note_allocations: list[CreditNoteAllocation] = []
    created_by:              str = ""
