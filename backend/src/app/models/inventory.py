from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import AuditMixin, TimestampMixin

StockOutReason = Literal["DAMAGED", "EXPIRED", "STOCKTAKE_CORRECTION", "LOST", "OTHER"]

StockMovementLogType = Literal[
    "STOCK_IN", "STOCK_OUT", "TRANSFER_IN", "TRANSFER_OUT", "PURCHASE", "SALE",
]


class InventoryBatch(BaseModel):
    batch_number:            str
    expiry_date:             str
    quantity:                int = Field(ge=0)
    received_quantity:       int = Field(ge=0, default=0)
    basic_sku:               Optional[str] = None
    basic_sku_quantity:      int = Field(ge=0, default=0)
    basic_sku_selling_price: float = Field(ge=0, default=0)
    basic_sku_purchase_price: float = Field(ge=0, default=0)
    manufacture_date:        Optional[str] = None
    channel_id:              Optional[str] = None
    purchase_invoice_id:     Optional[str] = None


class InventoryResponse(TimestampMixin):
    id:                       str
    branch_id:                str
    product_id:               str
    product_name:             str = ""
    basic_sku:                Optional[str] = None
    basic_sku_count:          int = 0
    batches:                  list[InventoryBatch] = []
    basic_sku_total_quantity: int = 0


class StockInPayload(BaseModel):
    batch_number:        str
    expiry_date:         str
    quantity:            int   = Field(ge=1)
    sku:                 Optional[str] = None
    purchase_price:      float = Field(ge=0)
    selling_price:       float = Field(ge=0)
    supplier_id:         Optional[str] = None
    supplier_name:       Optional[str] = ""
    notes:               Optional[str] = None
    manufacture_date:    Optional[str] = None
    stock_location_id:   Optional[str] = None
    channel_id:          Optional[str] = None
    purchase_invoice_id: Optional[str] = None


class StockInCreatePayload(StockInPayload):
    product_id: str
    branch_id:  Optional[str] = None


class BatchStockInItem(BaseModel):
    product_id:        str
    sku:               Optional[str] = None
    batch_number:      str
    expiry_date:       str
    quantity:          int   = Field(ge=1)
    purchase_price:    float = Field(ge=0)
    selling_price:     float = Field(ge=0)
    stock_location_id: Optional[str] = None
    notes:             Optional[str] = None


class BatchStockInPayload(BaseModel):
    branch_id: Optional[str] = None
    items:     list[BatchStockInItem] = Field(min_length=1)


class StockOutPayload(BaseModel):
    batch_number: str
    quantity:     int           = Field(ge=1)
    reason:       StockOutReason
    notes:        Optional[str] = None


# ─── Stock Movement Log ──────────────────────────────────────────────────────

class StockMovementLogResponse(AuditMixin):
    id:                       str
    branch_id:                str
    product_id:               str
    product_name:             str = ""
    batch_number:             str = ""
    expiry_date:              Optional[str] = None
    sku:                      Optional[str] = None
    quantity:                 int = 0
    purchase_price:           Optional[float] = None
    selling_price:            Optional[float] = None
    basic_sku:                Optional[str] = None
    basic_sku_count:          Optional[int] = None
    basic_sku_quantity:       Optional[int] = None
    basic_sku_selling_price:  Optional[float] = None
    basic_sku_purchase_price: Optional[float] = None
    stock_location_id:        Optional[str] = None
    movement_type:            StockMovementLogType
    reason:                   Optional[str] = None
    notes:                    Optional[str] = None
    reference_id:             Optional[str] = None
    reference_type:           Optional[str] = None


# ─── Location Suggestion ─────────────────────────────────────────────────────

class LocationSuggestionResponse(BaseModel):
    stock_location_id:   str = ""
    stock_location_name: str = ""
    is_new:              bool = False
