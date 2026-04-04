from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import TimestampMixin


class SupplierChannel(BaseModel):
    id:                  Optional[str] = None
    channel_name:        str
    contact_person_name: str
    phone:               str
    email:               str
    address:             Optional[str] = None


class ExpiryAlertConfig(BaseModel):
    days_before_expiry: int = Field(ge=1)
    brand_id:           Optional[str] = None
    brand_name:         Optional[str] = None


class SupplierBase(BaseModel):
    name:                  str = Field(min_length=1, max_length=200)
    registration_number:   Optional[str] = None
    channels:              list[SupplierChannel] = []
    expiry_alert_configs:  list[ExpiryAlertConfig] = []
    credit_term_days:      int = Field(default=30, ge=0)
    is_active:             bool = True


class SupplierCreate(SupplierBase): pass


class SupplierUpdate(BaseModel):
    name:                 Optional[str] = None
    registration_number:  Optional[str] = None
    channels:             Optional[list[SupplierChannel]] = None
    expiry_alert_configs: Optional[list[ExpiryAlertConfig]] = None
    credit_term_days:     Optional[int] = None
    is_active:            Optional[bool] = None


class SupplierResponse(SupplierBase, TimestampMixin):
    id: str
