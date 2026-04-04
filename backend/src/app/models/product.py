from pydantic import BaseModel, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

InteractionSeverity = Literal["MILD", "MODERATE", "SEVERE"]


class DrugInteraction(BaseModel):
    product_id:   str
    product_name: str
    severity:     InteractionSeverity
    description:  str


# ─── Sub-catalog models ───────────────────────────────────────────────────────

class ProductGenericBase(BaseModel):
    name:        str = Field(min_length=1)
    description: Optional[str] = None

class ProductGenericCreate(ProductGenericBase): pass
class ProductGenericResponse(ProductGenericBase):
    id: str


class ProductBrandBase(BaseModel):
    name:              str = Field(min_length=1)
    manufacturer_name: Optional[str] = None

class ProductBrandCreate(ProductBrandBase): pass
class ProductBrandResponse(ProductBrandBase):
    id: str


class ProductCategoryBase(BaseModel):
    name:        str = Field(min_length=1)
    description: Optional[str] = None

class ProductCategoryCreate(ProductCategoryBase): pass
class ProductCategoryResponse(ProductCategoryBase):
    id: str


class ProductUnitBase(BaseModel):
    name:         str = Field(min_length=1)
    abbreviation: str

class ProductUnitCreate(ProductUnitBase): pass
class ProductUnitResponse(ProductUnitBase):
    id: str


# ─── Product ──────────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    name:                    str = Field(min_length=1, max_length=200)
    generic_id:              str
    brand_id:                str
    category_id:             str
    unit_id:                 str
    barcode:                 Optional[str] = None
    sku:                     str
    requires_prescription:   bool = False
    interactions:            list[DrugInteraction] = []
    is_active:               bool = True


class ProductCreate(ProductBase): pass


class ProductUpdate(BaseModel):
    name:                  Optional[str] = None
    generic_id:            Optional[str] = None
    brand_id:              Optional[str] = None
    category_id:           Optional[str] = None
    unit_id:               Optional[str] = None
    barcode:               Optional[str] = None
    requires_prescription: Optional[bool] = None
    interactions:          Optional[list[DrugInteraction]] = None
    is_active:             Optional[bool] = None


class ProductResponse(ProductBase, TimestampMixin):
    id:            str
    generic_name:  str = ""
    brand_name:    str = ""
    category_name: str = ""
    unit_name:     str = ""
