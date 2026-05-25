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


class PrescriptionBase(BaseModel):
    patient_id:        str
    doctor_id:         str
    branch_id:         str
    items:             list[PrescriptionItem]
    prescription_date: str
    expiry_date:       str


class PrescriptionCreate(PrescriptionBase): pass


class PrescriptionUpdate(BaseModel):
    is_active: Optional[bool] = None


class PrescriptionResponse(PrescriptionBase, TimestampMixin):
    id:           str
    patient_name: str  = ""
    doctor_name:  str  = ""
    is_active:    bool = True
    usage_count:  int  = 0
