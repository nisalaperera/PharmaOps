from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import TimestampMixin


class DoctorBase(BaseModel):
    name:               str = Field(min_length=1)
    specialization:     str
    hospital_or_clinic: str
    license_number:     str
    phone:              str
    is_active:          bool = True


class DoctorCreate(DoctorBase): pass


class DoctorUpdate(BaseModel):
    name:               Optional[str]  = None
    specialization:     Optional[str]  = None
    hospital_or_clinic: Optional[str]  = None
    license_number:     Optional[str]  = None
    phone:              Optional[str]  = None
    is_active:          Optional[bool] = None


class DoctorResponse(DoctorBase, TimestampMixin):
    id: str
