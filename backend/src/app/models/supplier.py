from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from app.models.common import TimestampMixin
import uuid

# ─── Enums / Literals ─────────────────────────────────────────────────────────

SupplierType      = Literal["AGENCY", "DISTRIBUTOR"]
ChannelCategory   = Literal["AGENCY", "SUB"]
ContactType       = Literal["SALES", "DELIVERY"]
ContactTitle      = Literal["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]
DeliveryFrequency = Literal["DAILY", "WEEKLY", "BI_WEEKLY", "MONTHLY", "AS_NEEDED"]


# ─── Shared sub-models ────────────────────────────────────────────────────────

class ChannelContact(BaseModel):
    id:           Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    title:        ContactTitle
    first_name:   str = Field(min_length=1, max_length=100)
    last_name:    str = Field(min_length=1, max_length=100)
    landline:     Optional[str] = None
    mobile:       str
    whatsapp:     Optional[str] = None
    contact_type: ContactType


class ChannelProductMapping(BaseModel):
    product_id:   str
    product_name: str


class ExpiryAlertConfig(BaseModel):
    days_before_expiry: int = Field(ge=1)
    brand_id:           Optional[str] = None
    brand_name:         Optional[str] = None


# ─── Channel models ───────────────────────────────────────────────────────────

class AgencyChannel(BaseModel):
    id:               Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_name:     str = Field(min_length=1, max_length=200)
    contacts:         list[ChannelContact] = Field(default_factory=list, min_length=1)
    product_mappings: list[ChannelProductMapping] = []


class DistributorChannel(BaseModel):
    id:                Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_name:      str = Field(min_length=1, max_length=200)
    channel_category:  ChannelCategory
    agency_id:         Optional[str] = None
    agency_name:       Optional[str] = None
    credit_term_days:  int = Field(default=30, ge=0)
    delivery_frequency: DeliveryFrequency
    contacts:          list[ChannelContact] = Field(default_factory=list, min_length=1)
    product_mappings:  list[ChannelProductMapping] = []

    @model_validator(mode="after")
    def validate_agency_id(self):
        if self.channel_category == "AGENCY" and not self.agency_id:
            raise ValueError("agency_id is required when channel_category is AGENCY")
        return self


# ─── Supplier models ──────────────────────────────────────────────────────────

class SupplierBase(BaseModel):
    supplier_type:        SupplierType
    short_name:           str = Field(min_length=1, max_length=200)
    legal_name:           str = Field(min_length=1, max_length=200)
    registration_number:  Optional[str] = None
    agency_channels:      list[AgencyChannel]      = []
    distributor_channels: list[DistributorChannel] = []
    expiry_alert_configs: list[ExpiryAlertConfig]  = []
    is_active:            bool = True

    @model_validator(mode="after")
    def validate_channels(self):
        if self.supplier_type == "AGENCY" and self.distributor_channels:
            raise ValueError("Agency suppliers cannot have distributor channels")
        if self.supplier_type == "DISTRIBUTOR" and self.agency_channels:
            raise ValueError("Distributor suppliers cannot have agency channels")
        return self


class SupplierCreate(SupplierBase): pass


class SupplierUpdate(BaseModel):
    short_name:           Optional[str] = None
    legal_name:           Optional[str] = None
    registration_number:  Optional[str] = None
    agency_channels:      Optional[list[AgencyChannel]]      = None
    distributor_channels: Optional[list[DistributorChannel]] = None
    expiry_alert_configs: Optional[list[ExpiryAlertConfig]]  = None
    is_active:            Optional[bool] = None


class SupplierResponse(SupplierBase, TimestampMixin):
    id: str
