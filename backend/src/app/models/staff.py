from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

ShiftType      = Literal["MORNING","EVENING","FULL_DAY"]
AttendanceStatus = Literal["PRESENT","ABSENT","LATE","HALF_DAY"]
EmploymentType = Literal["SALARIED","HOURLY"]


class StaffBase(BaseModel):
    branch_id:       str
    full_name:       str = Field(min_length=1)
    phone:           str
    email:           Optional[str] = None
    role:            str
    employment_type: EmploymentType
    base_salary:     Optional[float] = None
    hourly_rate:     Optional[float] = None
    shift_type:      ShiftType
    join_date:       str
    is_active:       bool = True


class StaffCreate(StaffBase): pass
class StaffUpdate(BaseModel):
    full_name:       Optional[str] = None
    phone:           Optional[str] = None
    role:            Optional[str] = None
    employment_type: Optional[EmploymentType] = None
    base_salary:     Optional[float] = None
    hourly_rate:     Optional[float] = None
    shift_type:      Optional[ShiftType] = None
    is_active:       Optional[bool] = None

class StaffResponse(StaffBase, TimestampMixin):
    id: str


# ─── Attendance ───────────────────────────────────────────────────────────────

class AttendanceBase(BaseModel):
    staff_id:        str
    branch_id:       str
    date:            str
    shift_type:      ShiftType
    clock_in:        Optional[str] = None
    clock_out:       Optional[str] = None
    status:          AttendanceStatus = "PRESENT"
    overtime_hours:  float = 0
    notes:           Optional[str] = None


class AttendanceCreate(AttendanceBase): pass
class AttendanceUpdate(BaseModel):
    clock_in:       Optional[str] = None
    clock_out:      Optional[str] = None
    status:         Optional[AttendanceStatus] = None
    overtime_hours: Optional[float] = None
    notes:          Optional[str] = None

class AttendanceResponse(AttendanceBase, TimestampMixin):
    id:          str
    staff_name:  str = ""
