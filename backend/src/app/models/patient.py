from pydantic import BaseModel, Field
from typing import Optional
from app.models.common import TimestampMixin


class FamilyMember(BaseModel):
    id:            Optional[str] = None
    name:          str
    relationship:  str
    date_of_birth: Optional[str] = None


class PatientBase(BaseModel):
    full_name:    str = Field(min_length=1, max_length=100)
    phone:        str
    email:        Optional[str] = None
    date_of_birth: Optional[str] = None
    address:      Optional[str] = None
    family_members: list[FamilyMember] = []
    credit_limit: float = Field(default=0, ge=0)


class PatientCreate(PatientBase): pass


class PatientUpdate(BaseModel):
    full_name:      Optional[str] = None
    phone:          Optional[str] = None
    email:          Optional[str] = None
    address:        Optional[str] = None
    family_members: Optional[list[FamilyMember]] = None
    credit_limit:   Optional[float] = None


class PatientResponse(PatientBase, TimestampMixin):
    id:                  str
    outstanding_balance: float = 0
