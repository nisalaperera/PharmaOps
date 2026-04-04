from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import AuditMixin


class OperatingHours(BaseModel):
    day:        str
    open_time:  str
    close_time: str
    is_closed:  bool = False


class BranchBase(BaseModel):
    name:                   str = Field(min_length=2, max_length=100)
    address:                str
    phone:                  str
    license_number:         str
    assigned_pharmacist_id: Optional[str] = None
    assigned_staff_ids:     list[str] = []
    operating_hours:        list[OperatingHours] = []
    is_active:              bool = True


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BaseModel):
    name:                   Optional[str] = None
    address:                Optional[str] = None
    phone:                  Optional[str] = None
    license_number:         Optional[str] = None
    assigned_pharmacist_id: Optional[str] = None
    assigned_staff_ids:     Optional[list[str]] = None
    operating_hours:        Optional[list[OperatingHours]] = None
    is_active:              Optional[bool] = None


class BranchResponse(BranchBase, AuditMixin):
    id: str
