from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import TimestampMixin


class InventoryBatch(BaseModel):
    batch_number:   str
    expiry_date:    str
    quantity:       int = Field(ge=0)
    purchase_price: float = Field(ge=0)
    selling_price:  float = Field(ge=0)
    supplier_id:    str
    supplier_name:  str = ""
    received_date:  str


class InventoryResponse(TimestampMixin):
    id:              str
    branch_id:       str
    product_id:      str
    product_name:    str = ""
    batches:         list[InventoryBatch] = []
    total_quantity:  int = 0
    min_stock_level: int = 0
    is_low_stock:    bool = False


class InventoryUpdate(BaseModel):
    min_stock_level: Optional[int] = Field(default=None, ge=0)


class BatchAdjustment(BaseModel):
    product_id:     str
    batch_number:   str
    quantity_delta: int  # positive = add, negative = reduce
    reason:         str
