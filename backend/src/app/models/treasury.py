from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import AuditMixin


# ─── Cash Registry ────────────────────────────────────────────────────────────

class CashRegistryCreate(BaseModel):
    name:                 str
    branch_id:            str
    responsible_staff_id: Optional[str] = None


class CashRegistryUpdate(BaseModel):
    name:                 Optional[str]  = None
    responsible_staff_id: Optional[str]  = None
    is_active:            Optional[bool] = None


class CashRegistryResponse(BaseModel):
    id:                       str
    name:                     str
    branch_id:                str
    branch_name:              str
    responsible_staff_id:     Optional[str]   = None
    responsible_staff_name:   Optional[str]   = None
    current_balance:          float
    is_open:                  bool
    is_active:                bool
    created_at:               str
    updated_at:               str
    created_by_id:            Optional[str] = None
    created_by_name:          Optional[str] = None
    updated_by_id:            Optional[str] = None
    updated_by_name:          Optional[str] = None


class OpenRegistryPayload(BaseModel):
    opening_balance: float = 0.0
    notes:           Optional[str] = None


class CloseRegistryPayload(BaseModel):
    physical_count: float
    notes:          Optional[str] = None


class RegistryTransactionPayload(BaseModel):
    amount: float = Field(gt=0)
    notes:  Optional[str] = None


class CashRegistryTransactionResponse(BaseModel):
    id:              str
    registry_id:     str
    registry_name:   str
    branch_id:       str
    type:            str
    amount:          float
    balance_before:  float
    balance_after:   float
    physical_count:  Optional[float] = None
    discrepancy:     Optional[float] = None
    notes:           Optional[str]   = None
    reference_id:    Optional[str]   = None
    created_at:      str
    created_by_id:   Optional[str] = None
    created_by_name: Optional[str] = None


# ─── Bank Account ─────────────────────────────────────────────────────────────

class BankAccountCreate(BaseModel):
    bank_name:      str
    account_number: str
    account_name:   str
    branch_id:      str


class BankAccountUpdate(BaseModel):
    bank_name:      Optional[str]  = None
    account_number: Optional[str]  = None
    account_name:   Optional[str]  = None
    is_active:      Optional[bool] = None


class BankAccountResponse(BaseModel):
    id:              str
    bank_name:       str
    account_number:  str
    account_name:    str
    branch_id:       str
    branch_name:     str
    current_balance: float
    is_active:       bool
    created_at:      str
    updated_at:      str
    created_by_id:   Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by_id:   Optional[str] = None
    updated_by_name: Optional[str] = None


class BankTransactionPayload(BaseModel):
    amount: float = Field(gt=0)
    notes:  Optional[str] = None


class BankAccountTransactionResponse(BaseModel):
    id:              str
    account_id:      str
    account_name:    str
    branch_id:       str
    type:            str
    amount:          float
    balance_before:  float
    balance_after:   float
    notes:           Optional[str] = None
    reference_id:    Optional[str] = None
    created_at:      str
    created_by_id:   Optional[str] = None
    created_by_name: Optional[str] = None


# ─── Fund Transfer ────────────────────────────────────────────────────────────

class FundTransferCreate(BaseModel):
    from_source_type: Literal["CASH_REGISTRY", "BANK_ACCOUNT"]
    from_source_id:   str
    to_source_type:   Literal["CASH_REGISTRY", "BANK_ACCOUNT"]
    to_source_id:     str
    amount:           float = Field(gt=0)
    notes:            Optional[str] = None
    transfer_date:    str  # yyyy-MM-dd


class FundTransferResponse(BaseModel):
    id:               str
    from_source_type: str
    from_source_id:   str
    from_source_name: str
    to_source_type:   str
    to_source_id:     str
    to_source_name:   str
    amount:           float
    notes:            Optional[str] = None
    transfer_date:    str
    branch_id:        str
    created_at:       str
    created_by_id:    Optional[str] = None
    created_by_name:  Optional[str] = None
