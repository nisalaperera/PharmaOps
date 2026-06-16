from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

POStatus = Literal["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "PARTIAL", "RECEIVED", "CANCELLED"]


class POItem(BaseModel):
    product_id:     str
    product_name:   str = ""
    sku:            str = ""
    unit_quantity:  int   = Field(ge=1)
    free_quantity:  int   = Field(ge=0, default=0)
    discount:       float = Field(ge=0, default=0)
    unit_price:     float = Field(ge=0)
    line_total:     float = 0


class POReturnItem(BaseModel):
    product_id:    str
    product_name:  str = ""
    sku:           str = ""
    unit_quantity: int   = Field(ge=1)
    free_quantity: int   = Field(ge=0, default=0)
    unit_price:    float = Field(ge=0)
    line_total:    float = 0


class PurchaseOrderBase(BaseModel):
    branch_id:    str
    supplier_id:  str
    channel_id:   str
    order_date:   str
    items:        list[POItem]
    return_items: list[POReturnItem] = []
    notes:        Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase):
    pass


class PurchaseOrderUpdate(BaseModel):
    items:        Optional[list[POItem]]        = None
    return_items: Optional[list[POReturnItem]]  = None
    notes:        Optional[str]                 = None
    status:       Optional[POStatus]            = None
    order_date:   Optional[str]                 = None


class PurchaseOrderResponse(PurchaseOrderBase, TimestampMixin):
    id:               str
    order_number:     str = ""
    supplier_name:    str = ""
    channel_name:     str = ""
    credit_term_days: int   = 30
    total_amount:     float = 0
    return_amount:    float = 0
    status:           POStatus = "DRAFT"
    created_by:       str
    approved_by:      Optional[str] = None
    approved_at:      Optional[str] = None
