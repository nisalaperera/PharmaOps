from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

PatientRelationship = Literal["SELF", "SPOUSE", "CHILD", "PARENT", "SIBLING", "OTHER"]


class PatientBase(BaseModel):
    customer_id:   str
    name:          str = Field(min_length=1, max_length=100)
    relationship:  PatientRelationship = "SELF"
    date_of_birth: Optional[str] = None
    is_active:     bool = True


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    name:          Optional[str]                 = None
    relationship:  Optional[PatientRelationship] = None
    date_of_birth: Optional[str]                = None
    is_active:     Optional[bool]               = None


class PatientResponse(PatientBase, TimestampMixin):
    id:            str
    customer_name: str = ""
