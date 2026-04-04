from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

POStatus  = Literal["DRAFT","PENDING_APPROVAL","APPROVED","SENT","PARTIAL","RECEIVED","CANCELLED"]
GRNStatus = Literal["PENDING","COMPLETED","PARTIAL"]


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
    id:              str
    supplier_name:   str = ""
    channel_name:    str = ""
    total_amount:    float = 0
    status:          POStatus = "DRAFT"
    created_by:      str
    approved_by:     Optional[str] = None
    approved_at:     Optional[str] = None


# ─── GRN ─────────────────────────────────────────────────────────────────────

class GRNItem(BaseModel):
    product_id:         str
    product_name:       str = ""
    ordered_quantity:   int
    received_quantity:  int = Field(ge=0)
    batch_number:       str
    expiry_date:        str
    unit_price:         float = Field(ge=0)


class GRNCreate(BaseModel):
    purchase_order_id:  str
    branch_id:          str
    supplier_id:        str
    channel_id:         str
    items:              list[GRNItem]
    notes:              Optional[str] = None


class GRNResponse(GRNCreate, TimestampMixin):
    id:           str
    status:       GRNStatus = "PENDING"
    received_by:  str
    received_at:  str
