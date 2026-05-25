from pydantic import BaseModel, Field
from typing import Optional, Literal

PosCardType = Literal["VISA", "MASTERCARD", "AMEX", "OTHER"]


class PosMachineCreate(BaseModel):
    bank_account_id: str
    terminal_id:     str
    merchant_id:     Optional[str] = None
    notes:           Optional[str] = None


class PosMachineUpdate(BaseModel):
    terminal_id: Optional[str]  = None
    merchant_id: Optional[str]  = None
    notes:       Optional[str]  = None
    is_active:   Optional[bool] = None


class PosMachineResponse(BaseModel):
    id:                str
    bank_account_id:   str
    bank_account_name: str = ""
    bank_name:         str = ""
    branch_id:         str
    branch_name:       str = ""
    terminal_id:       str
    merchant_id:       Optional[str] = None
    unsettled_amount:  float = 0.0
    last_settled_at:   Optional[str] = None
    is_active:         bool = True
    notes:             Optional[str] = None
    created_at:        str
    updated_at:        str
    created_by_id:     Optional[str] = None
    created_by_name:   Optional[str] = None
    updated_by_id:     Optional[str] = None
    updated_by_name:   Optional[str] = None


class PosTransactionCreate(BaseModel):
    amount:           float = Field(gt=0)
    card_type:        PosCardType
    reference_number: Optional[str] = None
    transaction_date: str
    notes:            Optional[str] = None


class PosTransactionResponse(BaseModel):
    id:               str
    pos_machine_id:   str
    bank_account_id:  str
    branch_id:        str
    amount:           float
    card_type:        PosCardType
    reference_number: Optional[str] = None
    transaction_date: str
    is_settled:       bool = False
    settlement_id:    Optional[str] = None
    notes:            Optional[str] = None
    created_at:       str
    created_by_id:    Optional[str] = None
    created_by_name:  Optional[str] = None


class PosSettleRequest(BaseModel):
    settlement_date: str
    notes:           Optional[str] = None


class PosSettlementResponse(BaseModel):
    id:                str
    pos_machine_id:    str
    bank_account_id:   str
    bank_account_name: str = ""
    branch_id:         str
    total_amount:      float
    transaction_count: int
    settlement_date:   str
    notes:             Optional[str] = None
    created_at:        str
    created_by_id:     Optional[str] = None
    created_by_name:   Optional[str] = None
