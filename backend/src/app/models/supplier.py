from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal
from app.models.common import AuditMixin
from app.models.chain import EntityContact
import uuid

# ─── Enums / Literals ─────────────────────────────────────────────────────────

SupplierType      = Literal["AGENCY", "DISTRIBUTOR"]
PromotionType     = Literal["PERCENTAGE", "BONUS_QUANTITY"]
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
    product_id:            str
    product_name:          str
    sort_order:            int = 0
    cost_price:            Optional[float] = None
    pack_sku_id:           Optional[str] = None
    pack_sku_name:         Optional[str] = None
    default_promotion_ids: list[str] = []


class ExpiryAlertConfig(BaseModel):
    days_before_expiry: int = Field(ge=1)
    brand_id:           Optional[str] = None
    brand_name:         Optional[str] = None


class ChannelPromotion(BaseModel):
    id:               Optional[str]   = Field(default_factory=lambda: str(uuid.uuid4()))
    name:             str             = Field(min_length=1, max_length=200)
    promotion_type:   PromotionType
    discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    buy_quantity:     Optional[int]   = Field(default=None, ge=1)
    free_quantity:    Optional[int]   = Field(default=None, ge=1)
    is_default:       bool            = True
    valid_from:       Optional[str]   = None
    valid_to:         Optional[str]   = None
    is_active:        bool            = True


# ─── Channel models ───────────────────────────────────────────────────────────

class AgencyChannel(BaseModel):
    id:               Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_name:     str = Field(min_length=1, max_length=200)
    contacts:         list[ChannelContact] = Field(default_factory=list, min_length=1)
    entity_contacts:  list[EntityContact] = []
    credit_term_days: int = Field(default=30, ge=0)
    credit_limit:     Optional[float] = None
    promotions:       list[ChannelPromotion] = []
    product_mappings: list[ChannelProductMapping] = []


class DistributorChannel(BaseModel):
    id:                Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_name:      str = Field(min_length=1, max_length=200)
    channel_category:  ChannelCategory
    agency_id:         Optional[str] = None
    agency_name:       Optional[str] = None
    credit_term_days:  int = Field(default=30, ge=0)
    credit_limit:      Optional[float] = None
    delivery_frequency: DeliveryFrequency
    contacts:          list[ChannelContact] = Field(default_factory=list, min_length=1)
    entity_contacts:   list[EntityContact] = []
    promotions:        list[ChannelPromotion] = []
    product_mappings:  list[ChannelProductMapping] = []

    @model_validator(mode="after")
    def validate_agency_id(self):
        if self.channel_category == "AGENCY" and not self.agency_id:
            raise ValueError("agency_id is required when channel_category is AGENCY")
        return self


# ─── Supplier models ──────────────────────────────────────────────────────────

class SupplierBase(BaseModel):
    supplier_type:        SupplierType
    name:                 str = Field(min_length=1, max_length=200)
    legal_name:           str = Field(min_length=1, max_length=200)
    registration_number:  Optional[str] = None
    contacts:             list[EntityContact] = []
    credit_term_days:     int = Field(default=30, ge=0)
    credit_limit:         Optional[float] = None
    outstanding_balance:  float = 0
    notes:                Optional[str] = None
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
    name:                 Optional[str] = None
    legal_name:           Optional[str] = None
    registration_number:  Optional[str] = None
    contacts:             Optional[list[EntityContact]] = None
    credit_term_days:     Optional[int] = None
    credit_limit:         Optional[float] = None
    outstanding_balance:  Optional[float] = None
    notes:                Optional[str] = None
    agency_channels:      Optional[list[AgencyChannel]]      = None
    distributor_channels: Optional[list[DistributorChannel]] = None
    expiry_alert_configs: Optional[list[ExpiryAlertConfig]]  = None
    is_active:            Optional[bool] = None


class SupplierResponse(SupplierBase, AuditMixin):
    id: str
    short_name: Optional[str] = None
