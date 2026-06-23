from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import AuditMixin

StockMovementType   = Literal["STOCK_IN", "STOCK_OUT"]
StockMovementStatus = Literal["CREATED", "PARTIALLY_COMPLETED", "COMPLETED"]
StockOutReason      = Literal["DAMAGED", "EXPIRED", "STOCKTAKE_CORRECTION", "LOST", "OTHER"]


class StockMovementItem(BaseModel):
    product_id:              str
    product_name:            str = ""
    sku:                     str = ""
    batch_number:            str
    expiry_date:             str
    quantity:                int = Field(ge=1)
    confirmed_quantity:      int = Field(default=0, ge=0)
    purchase_price:          float = Field(default=0, ge=0)
    selling_price:           float = Field(default=0, ge=0)
    basic_sku:               Optional[str] = None
    basic_sku_count:         int = Field(default=0, ge=0)
    basic_sku_quantity:      int = Field(default=0, ge=0)
    basic_sku_selling_price: float = Field(default=0, ge=0)
    basic_sku_purchase_price: float = Field(default=0, ge=0)
    stock_location_id:       Optional[str] = None
    stock_location_name:     Optional[str] = None
    is_confirmed:            bool = False
    reason:                  Optional[StockOutReason] = None


class StockMovementCreate(BaseModel):
    type:      StockMovementType
    branch_id: Optional[str] = None
    items:     list[StockMovementItem] = Field(min_length=1)
    notes:     Optional[str] = None


class StockMovementUpdate(BaseModel):
    items: Optional[list[StockMovementItem]] = None
    notes: Optional[str] = None


class ConfirmItemPayload(BaseModel):
    item_index:          int = Field(ge=0)
    confirmed_quantity:  int = Field(ge=1)
    stock_location_id:   Optional[str] = None
    stock_location_name: Optional[str] = None


class StockMovementResponse(AuditMixin):
    id:              str
    movement_number: str
    type:            StockMovementType
    branch_id:       str
    status:          StockMovementStatus
    items:           list[StockMovementItem] = []
    notes:           Optional[str] = None
