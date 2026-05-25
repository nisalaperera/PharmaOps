from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import AuditMixin


class CustomerBase(BaseModel):
    full_name:     str = Field(min_length=1, max_length=100)
    phone:         str
    email:         Optional[str] = None
    date_of_birth: Optional[str] = None
    address:       Optional[str] = None
    credit_limit:  float = Field(default=0, ge=0)
    is_active:     bool  = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    full_name:     Optional[str]   = None
    phone:         Optional[str]   = None
    email:         Optional[str]   = None
    date_of_birth: Optional[str]   = None
    address:       Optional[str]   = None
    credit_limit:  Optional[float] = None
    is_active:     Optional[bool]  = None


class CustomerResponse(CustomerBase, AuditMixin):
    id:                  str
    outstanding_balance: float = 0.0
