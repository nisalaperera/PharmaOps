from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from app.models.common import AuditMixin

# ─── Enums / Literals ─────────────────────────────────────────────────────────

PurchaseInvoiceStatus        = Literal["DRAFT", "RECEIVED", "PARTIALLY_VERIFIED", "VERIFIED"]
PurchaseInvoicePaymentStatus = Literal["UNPAID", "PARTIALLY_PAID", "PAID"]
PurchasePaymentMethod        = Literal["CASH", "CHEQUE", "BANK_TRANSFER"]
ChequeStatus                 = Literal["DRAFTED", "ISSUED", "CLEARED", "RETURNED"]


# ─── Line items ───────────────────────────────────────────────────────────────

class PurchaseInvoiceItem(BaseModel):
    product_id:         str
    product_name:       str = ""
    sku:                str = ""
    batch_number:       str
    expiry_date:        str
    unit_quantity:      int   = Field(ge=1)
    free_quantity:      int   = Field(default=0, ge=0)
    # Percentage discount (0-100) applied to the line subtotal.
    discount:           float = Field(default=0, ge=0, le=100)
    unit_price:         float = Field(ge=0)
    selling_price:      float = Field(default=0, ge=0)
    line_total:         float = 0
    confirmed_quantity: int   = 0
    stock_location_id:  Optional[str] = None
    is_confirmed:       bool  = False


class PurchaseReturnItem(BaseModel):
    product_id:         str
    product_name:       str = ""
    sku:                str = ""
    batch_number:       str = ""
    expiry_date:        str = ""
    quantity:           int   = Field(ge=1)
    unit_price:         float = Field(ge=0)
    line_total:         float = 0
    # True → deduct this return from the current invoice now (auto-accepted).
    # False → keep as pending supplier credit for a later invoice.
    deduct_now:         bool  = False
    confirmed_quantity: int   = 0
    stock_location_id:  Optional[str] = None
    is_confirmed:       bool  = False


class ConfirmInvoiceItemPayload(BaseModel):
    item_index:         int = Field(ge=0)
    confirmed_quantity: int = Field(ge=1)
    stock_location_id:  Optional[str] = None


class ConfirmReturnItemPayload(BaseModel):
    item_index:         int = Field(ge=0)
    confirmed_quantity: int = Field(ge=1)
    stock_location_id:  Optional[str] = None


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
    return_items:             list[PurchaseReturnItem]  = []  # legacy; no longer written by terminal
    # Return line items (by item_id) deducted from this invoice as credit.
    applied_return_item_ids:  list[str] = []
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
    status:                   Optional[PurchaseInvoiceStatus] = None
    items:                    Optional[list[PurchaseInvoiceItem]] = None
    return_items:             Optional[list[PurchaseReturnItem]]  = None
    applied_return_item_ids:  Optional[list[str]] = None
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
    payment_date:      str
    payment_method:    PurchasePaymentMethod
    cash_register_id:  Optional[str] = None
    bank_account_id:   Optional[str] = None
    cheque_book_id:    Optional[str] = None
    cheque_number:     Optional[str] = None
    cheque_due_date:   Optional[str] = None
    cheque_status:     Optional[ChequeStatus] = "ISSUED"
    reference:         Optional[str] = None
    allocations:       list[PaymentAllocation] = []
    credit_note_ids:   list[str] = []

    @model_validator(mode="after")
    def validate_has_allocations(self):
        if not self.allocations and not self.credit_note_ids:
            raise ValueError("At least one invoice allocation or credit note is required")
        return self


class PurchasePaymentResponse(AuditMixin):
    id:                      str
    payment_date:            str
    payment_method:          PurchasePaymentMethod
    cash_register_id:        Optional[str] = None
    bank_account_id:         Optional[str] = None
    cheque_book_id:          Optional[str] = None
    cheque_number:           Optional[str] = None
    cheque_due_date:         Optional[str] = None
    cheque_status:           Optional[str] = None
    reference:               Optional[str] = None
    total_amount:            float = 0
    allocations:             list[PaymentAllocation] = []
    credit_note_allocations: list[CreditNoteAllocation] = []
    created_by:              str = ""
