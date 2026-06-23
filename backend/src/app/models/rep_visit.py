from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import AuditMixin


class RepVisitBase(BaseModel):
    supplier_id:    str
    channel_id:     str
    visit_date:     str
    rep_name:       str = Field(min_length=1, max_length=200)
    rep_contact:    Optional[str] = None
    notes:          Optional[str] = None
    purchase_order_id: Optional[str] = None


class RepVisitCreate(RepVisitBase):
    pass


class RepVisitUpdate(BaseModel):
    visit_date:     Optional[str] = None
    rep_name:       Optional[str] = None
    rep_contact:    Optional[str] = None
    notes:          Optional[str] = None
    purchase_order_id: Optional[str] = None


class RepVisitResponse(RepVisitBase, AuditMixin):
    id: str
    supplier_name: str = ""
    channel_name:  str = ""
