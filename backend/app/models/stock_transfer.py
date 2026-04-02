from pydantic import BaseModel
from typing import Optional, Literal
from app.models.common import TimestampMixin

TransferStatus = Literal["PENDING","CONFIRMED","REJECTED","CANCELLED"]


class TransferItem(BaseModel):
    product_id:   str
    product_name: str = ""
    batch_number: str
    quantity:     int


class StockTransferCreate(BaseModel):
    source_branch_id:      str
    destination_branch_id: str
    items:                 list[TransferItem]
    notes:                 Optional[str] = None


class StockTransferResponse(StockTransferCreate, TimestampMixin):
    id:                      str
    source_branch_name:      str = ""
    destination_branch_name: str = ""
    status:                  TransferStatus = "PENDING"
    initiated_by:            str
    confirmed_by:            Optional[str] = None
    confirmed_at:            Optional[str] = None
