from pydantic import BaseModel, Field
from typing import Optional, Generic, TypeVar
from datetime import datetime

T = TypeVar("T")


class TimestampMixin(BaseModel):
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PaginatedResponse(BaseModel, Generic[T]):
    data:        list[T]
    total:       int
    page:        int
    page_size:   int
    total_pages: int


class PaginationParams(BaseModel):
    page:      int = Field(default=1,  ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by:   Optional[str] = None
    sort_dir:  Optional[str] = "asc"
    search:    Optional[str] = None


def paginate(items: list, page: int, page_size: int) -> dict:
    total       = len(items)
    total_pages = max(1, -(-total // page_size))  # ceil division
    start       = (page - 1) * page_size
    end         = start + page_size

    return {
        "data":        items[start:end],
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": total_pages,
    }
