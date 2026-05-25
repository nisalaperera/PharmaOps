from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal, Any

SkuType = Literal["COUNT", "VOLUME", "WEIGHT", "LENGTH"]


class SkuMapping(BaseModel):
    sku:              str
    mapped_sku:       str
    mapped_sku_count: int
    basic_sku_count:  int


# ─── Sub-catalog models ───────────────────────────────────────────────────────

class ProductGenericBase(BaseModel):
    name:        str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    is_active:   bool = True

class ProductGenericCreate(ProductGenericBase): pass
class ProductGenericUpdate(BaseModel):
    name:        Optional[str]  = Field(default=None, min_length=1, max_length=200)
    description: Optional[str]  = None
    is_active:   Optional[bool] = None
class ProductGenericResponse(ProductGenericBase):
    id: str


class ProductBrandBase(BaseModel):
    name:              str = Field(min_length=1, max_length=200)
    manufacturer_name: Optional[str] = None
    description:       Optional[str] = None
    is_active:         bool = True

class ProductBrandCreate(ProductBrandBase): pass
class ProductBrandUpdate(BaseModel):
    name:              Optional[str]  = Field(default=None, min_length=1, max_length=200)
    manufacturer_name: Optional[str]  = None
    description:       Optional[str]  = None
    is_active:         Optional[bool] = None
class ProductBrandResponse(ProductBrandBase):
    id: str


class ProductCategoryBase(BaseModel):
    name:        str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    parent_id:   Optional[str] = None
    is_active:   bool = True

class ProductCategoryCreate(ProductCategoryBase): pass
class ProductCategoryUpdate(BaseModel):
    name:        Optional[str]  = Field(default=None, min_length=1, max_length=200)
    description: Optional[str]  = None
    parent_id:   Optional[str]  = None
    is_active:   Optional[bool] = None
class ProductCategoryResponse(ProductCategoryBase):
    id:          str
    parent_name: Optional[str] = None


class ProductSkuBase(BaseModel):
    name:      str           = Field(min_length=1, max_length=100)
    plural:    Optional[str] = Field(default=None, max_length=100)
    sku_type:  SkuType
    is_active: bool          = True

    @model_validator(mode="before")
    @classmethod
    def _migrate_unit_type(cls, data: Any) -> Any:
        if isinstance(data, dict) and not data.get("sku_type") and data.get("unit_type"):
            data["sku_type"] = data["unit_type"]
        return data

class ProductSkuCreate(ProductSkuBase): pass
class ProductSkuUpdate(BaseModel):
    name:      Optional[str]     = Field(default=None, min_length=1, max_length=100)
    plural:    Optional[str]     = Field(default=None, max_length=100)
    sku_type:  Optional[SkuType] = None
    is_active: Optional[bool]    = None
class ProductSkuResponse(ProductSkuBase):
    id: str


# ─── Product ──────────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    name:                  str = Field(min_length=1, max_length=200)
    generic_id:            str
    brand_id:              str
    category_id:           str
    basic_sku_id:          str = ""
    barcode:               Optional[str] = None
    specific_instructions: Optional[str] = None
    sku_mappings:          list[SkuMapping] = []
    is_active:             bool = True

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("basic_sku_id") and data.get("unit_id"):
                data["basic_sku_id"] = data["unit_id"]
            if not data.get("basic_sku_name") and data.get("unit_name"):
                data["basic_sku_name"] = data["unit_name"]
        return data


class ProductCreate(ProductBase):
    basic_sku_id: str = Field(min_length=1)


class ProductUpdate(BaseModel):
    name:                  Optional[str]             = None
    generic_id:            Optional[str]             = None
    brand_id:              Optional[str]             = None
    category_id:           Optional[str]             = None
    basic_sku_id:          Optional[str]             = None
    barcode:               Optional[str]             = None
    specific_instructions: Optional[str]             = None
    sku_mappings:          Optional[list[SkuMapping]] = None
    is_active:             Optional[bool]            = None


class ProductResponse(ProductBase):
    id:                    str
    generic_name:          str = ""
    brand_name:            str = ""
    category_name:         str = ""
    basic_sku_name:        str = ""
    created_at:            Optional[str] = None
    created_by_id:         Optional[str] = None
    created_by_name:       Optional[str] = None
    last_modified_at:      Optional[str] = None
    last_modified_by_id:   Optional[str] = None
    last_modified_by_name: Optional[str] = None
