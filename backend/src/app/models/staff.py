import re
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Literal
from app.models.common import AuditMixin

_TIME_RE = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')

ShiftType        = Literal["MORNING", "EVENING", "FULL_DAY"]
AttendanceStatus = Literal["PRESENT", "ABSENT", "LATE", "HALF_DAY"]
EmploymentType   = Literal["SALARIED", "HOURLY"]


class StaffBase(BaseModel):
    branch_id:        str
    title:            Optional[str] = None
    first_name:       str = Field(min_length=1)
    last_name:        str = Field(min_length=1)
    mobile_1:         str
    mobile_2:         Optional[str] = None
    landline:         Optional[str] = None
    whatsapp_number:  Optional[str] = None
    email:            Optional[str] = None
    epf_no:           Optional[str] = None
    id_number:        Optional[str] = None
    address:          Optional[str] = None
    role:             str
    employment_type:  Optional[EmploymentType] = None
    base_salary:      Optional[float] = None
    hourly_rate:      Optional[float] = None
    shift_type:       Optional[ShiftType] = None
    is_active:        bool = True


class StaffCreate(StaffBase): pass

class StaffUpdate(BaseModel):
    title:            Optional[str] = None
    first_name:       Optional[str] = None
    last_name:        Optional[str] = None
    mobile_1:         Optional[str] = None
    mobile_2:         Optional[str] = None
    landline:         Optional[str] = None
    whatsapp_number:  Optional[str] = None
    email:            Optional[str] = None
    epf_no:           Optional[str] = None
    id_number:        Optional[str] = None
    address:          Optional[str] = None
    role:             Optional[str] = None
    employment_type:  Optional[EmploymentType] = None
    base_salary:      Optional[float] = None
    hourly_rate:      Optional[float] = None
    shift_type:       Optional[ShiftType] = None
    is_active:        Optional[bool] = None

class StaffResponse(StaffBase, AuditMixin):
    id:        str
    join_date: Optional[str] = None   # retained for backward-compat with existing records


# ─── Attendance ───────────────────────────────────────────────────────────────

def _validate_time(value: Optional[str], field_name: str) -> Optional[str]:
    """Normalise empty strings to None and validate HH:MM format."""
    if value is None or value == "":
        return None
    if not _TIME_RE.match(value):
        raise ValueError(f"{field_name} must be a valid time in HH:MM format")
    return value


def _validate_clock_order(clock_in: Optional[str], clock_out: Optional[str]) -> None:
    """Raise if clock_out is set without clock_in, or clock_out ≤ clock_in."""
    if clock_out and not clock_in:
        raise ValueError("Clock In is required when Clock Out is set")
    if clock_in and clock_out:
        in_h, in_m   = map(int, clock_in.split(":"))
        out_h, out_m = map(int, clock_out.split(":"))
        if (out_h * 60 + out_m) <= (in_h * 60 + in_m):
            raise ValueError("Clock Out must be after Clock In")


class AttendanceBase(BaseModel):
    staff_id:        str
    branch_id:       str
    date:            str
    shift_type:      Optional[ShiftType] = None
    clock_in:        Optional[str] = None
    clock_out:       Optional[str] = None
    status:          AttendanceStatus = "PRESENT"
    overtime_hours:  float = 0
    notes:           Optional[str] = None

    @field_validator("clock_in", mode="before")
    @classmethod
    def validate_clock_in(cls, v: Optional[str]) -> Optional[str]:
        return _validate_time(v, "Clock In")

    @field_validator("clock_out", mode="before")
    @classmethod
    def validate_clock_out(cls, v: Optional[str]) -> Optional[str]:
        return _validate_time(v, "Clock Out")

    @model_validator(mode="after")
    def validate_clock_order(self) -> "AttendanceBase":
        _validate_clock_order(self.clock_in, self.clock_out)
        return self


class AttendanceCreate(AttendanceBase): pass

class AttendanceUpdate(BaseModel):
    clock_in:       Optional[str] = None
    clock_out:      Optional[str] = None
    status:         Optional[AttendanceStatus] = None
    overtime_hours: Optional[float] = None
    notes:          Optional[str] = None

    @field_validator("clock_in", mode="before")
    @classmethod
    def validate_clock_in(cls, v: Optional[str]) -> Optional[str]:
        return _validate_time(v, "Clock In")

    @field_validator("clock_out", mode="before")
    @classmethod
    def validate_clock_out(cls, v: Optional[str]) -> Optional[str]:
        return _validate_time(v, "Clock Out")

    @model_validator(mode="after")
    def validate_clock_order(self) -> "AttendanceUpdate":
        _validate_clock_order(self.clock_in, self.clock_out)
        return self

class AttendanceResponse(AttendanceBase, AuditMixin):
    id:          str
    staff_name:  str = ""
