from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import TimestampMixin


class PrescriptionItem(BaseModel):
    product_id:   str
    product_name: str = ""
    dosage:       str
    frequency:    str
    duration:     str
    quantity:     int = Field(ge=1)


class DoctorBase(BaseModel):
    name:              str = Field(min_length=1)
    specialization:    str
    hospital_or_clinic: str
    license_number:    str
    phone:             str
    is_active:         bool = True


class DoctorCreate(DoctorBase): pass
class DoctorUpdate(BaseModel):
    name:               Optional[str] = None
    specialization:     Optional[str] = None
    hospital_or_clinic: Optional[str] = None
    license_number:     Optional[str] = None
    phone:              Optional[str] = None
    is_active:          Optional[bool] = None

class DoctorResponse(DoctorBase, TimestampMixin):
    id: str


class PrescriptionBase(BaseModel):
    patient_id:         str
    doctor_id:          str
    branch_id:          str
    items:              list[PrescriptionItem]
    prescription_date:  str
    expiry_date:        str


class PrescriptionCreate(PrescriptionBase): pass


class PrescriptionResponse(PrescriptionBase, TimestampMixin):
    id:           str
    patient_name: str = ""
    doctor_name:  str = ""
    is_active:    bool = True
    usage_count:  int = 0
