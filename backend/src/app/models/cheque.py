from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal

# ─── Cheque Book ──────────────────────────────────────────────────────────────

class ChequeBookCreate(BaseModel):
    bank_account_id: str
    series_name:     str   = Field(..., min_length=1, max_length=100)
    start_number:    int   = Field(..., gt=0)
    end_number:      int   = Field(..., gt=0)
    notes:           Optional[str] = None

    @model_validator(mode="after")
    def check_range(self):
        if self.end_number < self.start_number:
            raise ValueError("end_number must be >= start_number")
        return self


class ChequeBookUpdate(BaseModel):
    series_name: Optional[str]  = Field(None, min_length=1, max_length=100)
    notes:       Optional[str]  = None
    is_active:   Optional[bool] = None


class ChequeBookResponse(BaseModel):
    id:                str
    bank_account_id:   str
    bank_account_name: str
    bank_name:         str
    branch_id:         str
    branch_name:       str
    series_name:       str
    start_number:      int
    end_number:        int
    total_leaves:      int
    used_leaves:       int
    is_active:         bool
    notes:             Optional[str] = None
    created_at:        str
    updated_at:        str
    created_by_id:     Optional[str] = None
    created_by_name:   Optional[str] = None
    updated_by_id:     Optional[str] = None
    updated_by_name:   Optional[str] = None


# ─── Cheque Issue ─────────────────────────────────────────────────────────────

class ChequeIssueCreate(BaseModel):
    cheque_number: int   = Field(..., gt=0)
    payee:         str   = Field(..., min_length=1, max_length=200)
    amount:        float = Field(..., gt=0)
    issue_date:    str
    purpose:       Optional[str] = None
    notes:         Optional[str] = None


class ChequeIssueStatusUpdate(BaseModel):
    status: Literal["CLEARED", "BOUNCED", "CANCELLED"]
    notes:  Optional[str] = None


class ChequeIssueResponse(BaseModel):
    id:                str
    cheque_book_id:    str
    bank_account_id:   str
    cheque_number:     int
    payee:             str
    amount:            float
    issue_date:        str
    purpose:           Optional[str] = None
    status:            str
    status_updated_at: Optional[str] = None
    notes:             Optional[str] = None
    created_at:        str
    updated_at:        str
    created_by_id:     Optional[str] = None
    created_by_name:   Optional[str] = None
