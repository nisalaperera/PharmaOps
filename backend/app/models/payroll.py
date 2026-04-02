from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

DeductionType = Literal["TAX","EPF","ETF","LOAN","OTHER"]


class PayrollDeduction(BaseModel):
    type:        DeductionType
    description: Optional[str] = None
    amount:      float = Field(ge=0)


class PayrollCreate(BaseModel):
    staff_id:    str
    branch_id:   str
    month:       int = Field(ge=1, le=12)
    year:        int = Field(ge=2020)
    deductions:  list[PayrollDeduction] = []


class PayrollUpdate(BaseModel):
    deductions:  Optional[list[PayrollDeduction]] = None
    is_paid:     Optional[bool] = None
    paid_at:     Optional[str] = None


class PayrollResponse(PayrollCreate, TimestampMixin):
    id:               str
    staff_name:       str = ""
    basic_salary:     float = 0
    overtime_pay:     float = 0
    gross_salary:     float = 0
    total_deductions: float = 0
    net_salary:       float = 0
    is_paid:          bool = False
    paid_at:          Optional[str] = None
    paid_by:          Optional[str] = None
