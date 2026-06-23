import uuid
from pydantic import BaseModel, Field, EmailStr
from typing import Literal, Optional
from app.models.common import AuditMixin


ContactTitle = Literal["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]
CurrencyCode = Literal["LKR", "USD", "EUR", "GBP", "INR"]


class EntityContact(BaseModel):
    id:        Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    identifier: str = Field(min_length=1, max_length=100)
    title:      ContactTitle
    first_name: str = Field(min_length=1, max_length=100)
    last_name:  str = Field(min_length=1, max_length=100)
    mobile_1:   str
    mobile_2:   Optional[str] = None
    whatsapp:   Optional[str] = None
    landline:   Optional[str] = None
    email:      Optional[EmailStr] = None
    is_active:  bool = True


class PayeTaxSlab(BaseModel):
    min_amount:   float = Field(ge=0)
    max_amount:   Optional[float] = None
    rate_percent: float = Field(ge=0, le=100)
    fixed_amount: float = Field(ge=0, default=0)


class ChainSettings(BaseModel):
    default_currency:       CurrencyCode = "LKR"
    low_stock_threshold:    int = Field(default=10, ge=0)
    expiry_alert_days:      int = Field(default=90, ge=0)
    loyalty_points_rate:    Optional[float] = None
    tax_enabled:            bool = False
    is_discount_applicable: bool = False
    invoice_footer_text:    Optional[str] = None
    storage_conditions:     list[str] = []
    special_instructions:   list[str] = []
    dosage_instructions:    list[str] = []


class ChainHRParams(BaseModel):
    standard_daily_hours:   float = Field(default=8.0, ge=0)
    working_days_per_month: int = Field(default=26, ge=1, le=31)
    ot_rate_multiplier:     float = Field(default=1.5, ge=1.0)
    epf_employee_rate:      float = Field(default=8.0, ge=0, le=100)
    epf_employer_rate:      float = Field(default=12.0, ge=0, le=100)
    etf_employer_rate:      float = Field(default=3.0, ge=0, le=100)
    paye_tax_slabs:         list[PayeTaxSlab] = []


class ChainBase(BaseModel):
    name:         str = Field(min_length=2, max_length=200)
    logo:         Optional[str] = None
    chain_prefix: str = Field(min_length=1, max_length=10)
    contacts:     list[EntityContact] = []
    settings:     ChainSettings = Field(default_factory=ChainSettings)
    hr_params:    ChainHRParams = Field(default_factory=ChainHRParams)


class ChainCreate(ChainBase):
    pass


class ChainUpdate(BaseModel):
    name:         Optional[str] = None
    logo:         Optional[str] = None
    chain_prefix: Optional[str] = None
    contacts:     Optional[list[EntityContact]] = None
    settings:     Optional[ChainSettings] = None
    hr_params:    Optional[ChainHRParams] = None


class ChainResponse(ChainBase, AuditMixin):
    id: str
