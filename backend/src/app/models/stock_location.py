from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import AuditMixin


class StockLocationBase(BaseModel):
    branch_id:   str
    name:        str = Field(min_length=1, max_length=100)
    code:        str = Field(min_length=1, max_length=20)
    description: Optional[str] = None
    is_active:   bool = True


class StockLocationCreate(StockLocationBase):
    pass


class StockLocationUpdate(BaseModel):
    name:        Optional[str]  = Field(default=None, min_length=1, max_length=100)
    code:        Optional[str]  = Field(default=None, min_length=1, max_length=20)
    description: Optional[str]  = None
    is_active:   Optional[bool] = None


class StockLocationResponse(StockLocationBase, AuditMixin):
    id: str
