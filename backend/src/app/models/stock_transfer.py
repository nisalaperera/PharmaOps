from pydantic import BaseModel
from typing import Optional, Literal
from app.models.common import TimestampMixin

TransferStatus = Literal[
    "PENDING", "IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "REJECTED", "CANCELLED",
]


class TransferItem(BaseModel):
    product_id:        str
    product_name:      str = ""
    batch_number:      str
    quantity:          int
    received_quantity: int = 0


class TransferReceiveItem(BaseModel):
    product_id:        str
    batch_number:      str
    received_quantity: int


class TransferReceivePayload(BaseModel):
    items: list[TransferReceiveItem]


class StockTransferCreate(BaseModel):
    source_branch_id:      str
    destination_branch_id: str
    items:                 list[TransferItem]
    notes:                 Optional[str] = None


class StockTransferResponse(StockTransferCreate, TimestampMixin):
    id:                      str
    transfer_number:         str = ""
    source_branch_name:      str = ""
    destination_branch_name: str = ""
    status:                  TransferStatus = "PENDING"
    initiated_by:            str = ""
    dispatched_by:           Optional[str] = None
    dispatched_at:           Optional[str] = None
    confirmed_by:            Optional[str] = None
    confirmed_at:            Optional[str] = None
    received_by:             Optional[str] = None
    received_at:             Optional[str] = None
