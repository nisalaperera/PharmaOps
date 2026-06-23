from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import AuditMixin
from app.models.chain import EntityContact, CurrencyCode, PayeTaxSlab


class OperatingHours(BaseModel):
    day:        str
    open_time:  str
    close_time: str
    is_closed:  bool = False


class BranchSettings(BaseModel):
    currency:               Optional[CurrencyCode] = None
    logo:                   Optional[str] = None
    low_stock_threshold:    Optional[int] = None
    expiry_alert_days:      Optional[int] = None
    loyalty_points_rate:    Optional[float] = None
    tax_enabled:            Optional[bool] = None
    is_discount_applicable: Optional[bool] = None
    invoice_footer_text:    Optional[str] = None
    storage_conditions:     Optional[list[str]] = None
    special_instructions:   Optional[list[str]] = None
    dosage_instructions:    Optional[list[str]] = None


class BranchHRParams(BaseModel):
    standard_daily_hours:   Optional[float] = None
    working_days_per_month: Optional[int] = None
    ot_rate_multiplier:     Optional[float] = None
    epf_employee_rate:      Optional[float] = None
    epf_employer_rate:      Optional[float] = None
    etf_employer_rate:      Optional[float] = None
    paye_tax_slabs:         Optional[list[PayeTaxSlab]] = None


class BranchBase(BaseModel):
    name:                    str = Field(min_length=2, max_length=100)
    address:                 str
    license_number:          str
    branch_prefix:           Optional[str] = Field(default=None, max_length=10)
    chain_id:                Optional[str] = None
    branch_manager:          Optional[str] = None
    assigned_staff_ids:      list[str] = []
    contacts:                list[EntityContact] = []
    operating_hours:         list[OperatingHours] = []
    settings:                Optional[BranchSettings] = None
    hr_params:               Optional[BranchHRParams] = None
    is_active:               bool = True


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BaseModel):
    name:                    Optional[str] = None
    address:                 Optional[str] = None
    license_number:          Optional[str] = None
    branch_prefix:           Optional[str] = None
    chain_id:                Optional[str] = None
    branch_manager:          Optional[str] = None
    assigned_staff_ids:      Optional[list[str]] = None
    contacts:                Optional[list[EntityContact]] = None
    operating_hours:         Optional[list[OperatingHours]] = None
    settings:                Optional[BranchSettings] = None
    hr_params:               Optional[BranchHRParams] = None
    is_active:               Optional[bool] = None


class BranchResponse(BranchBase, AuditMixin):
    id: str
    phone:                  Optional[str] = None
    assigned_pharmacist_id: Optional[str] = None
