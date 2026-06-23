from pydantic import BaseModel, Field, model_validator
from typing import Optional, Literal, Any
from app.models.common import AuditMixin

SkuType = Literal["COUNT", "VOLUME", "WEIGHT", "LENGTH"]

DosageForm = Literal[
    "TABLET", "CAPSULE", "SYRUP", "INJECTION", "CREAM", "OINTMENT",
    "DROPS", "INHALER", "SUPPOSITORY", "PATCH", "POWDER", "SOLUTION",
    "SUSPENSION", "GEL", "SPRAY", "LOZENGE", "OTHER",
]

ControlledSchedule = Literal[
    "NONE", "SCHEDULE_I", "SCHEDULE_II", "SCHEDULE_III", "SCHEDULE_IV", "SCHEDULE_V",
]


class SkuMapping(BaseModel):
    sku:              str
    mapped_sku:       str
    mapped_sku_count: int
    basic_sku_count:  int


# ─── Sub-catalog models ───────────────────────────────────────────────────────

class ProductGenericBase(BaseModel):
    name:                          str = Field(min_length=1, max_length=200)
    description:                   Optional[str] = None
    dosage_form:                   Optional[DosageForm] = None
    requires_prescription:         bool = False
    controlled_substance_schedule: Optional[ControlledSchedule] = "NONE"
    active_ingredients:            list[str] = []
    side_effects:                  list[str] = []
    drug_interactions:             list[str] = []
    local_license_number:          Optional[str] = None
    storage_conditions:            list[str] = []
    special_instructions:          list[str] = []
    dosage_instructions:           list[str] = []
    stock_location_id:             Optional[str] = None
    is_active:                     bool = True

class ProductGenericCreate(ProductGenericBase): pass
class ProductGenericUpdate(BaseModel):
    name:                          Optional[str]  = Field(default=None, min_length=1, max_length=200)
    description:                   Optional[str]  = None
    dosage_form:                   Optional[DosageForm] = None
    requires_prescription:         Optional[bool] = None
    controlled_substance_schedule: Optional[ControlledSchedule] = None
    active_ingredients:            Optional[list[str]] = None
    side_effects:                  Optional[list[str]] = None
    drug_interactions:             Optional[list[str]] = None
    local_license_number:          Optional[str]  = None
    storage_conditions:            Optional[list[str]] = None
    special_instructions:          Optional[list[str]] = None
    dosage_instructions:           Optional[list[str]] = None
    stock_location_id:             Optional[str]  = None
    is_active:                     Optional[bool] = None
class ProductGenericResponse(ProductGenericBase, AuditMixin):
    id: str
    stock_location_name: Optional[str] = None


class ProductBrandBase(BaseModel):
    name:                 str = Field(min_length=1, max_length=200)
    manufacturer_name:    Optional[str] = None
    country:              Optional[str] = None
    return_expiry_before: Optional[int] = None
    is_active:            bool = True

class ProductBrandCreate(ProductBrandBase): pass
class ProductBrandUpdate(BaseModel):
    name:                 Optional[str]  = Field(default=None, min_length=1, max_length=200)
    manufacturer_name:    Optional[str]  = None
    country:              Optional[str]  = None
    return_expiry_before: Optional[int]  = None
    is_active:            Optional[bool] = None
class ProductBrandResponse(ProductBrandBase, AuditMixin):
    id: str


class ProductCategoryBase(BaseModel):
    name:                       str = Field(min_length=1, max_length=200)
    parent_id:                  Optional[str] = None
    is_discount_applicable:     bool = False
    default_margin_percentage:  Optional[float] = Field(default=None, ge=0, le=999)
    icon:                       Optional[str] = None
    colour:                     Optional[str] = None
    is_active:                  bool = True

class ProductCategoryCreate(ProductCategoryBase): pass
class ProductCategoryUpdate(BaseModel):
    name:                       Optional[str]   = Field(default=None, min_length=1, max_length=200)
    parent_id:                  Optional[str]   = None
    is_discount_applicable:     Optional[bool]  = None
    default_margin_percentage:  Optional[float] = Field(default=None, ge=0, le=999)
    icon:                       Optional[str]   = None
    colour:                     Optional[str]   = None
    is_active:                  Optional[bool]  = None
class ProductCategoryResponse(ProductCategoryBase, AuditMixin):
    id:                          str
    parent_name:                 Optional[str] = None
    level:                       int = 0
    path:                        str = ""
    effective_margin_percentage: Optional[float] = None


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
class ProductSkuResponse(ProductSkuBase, AuditMixin):
    id: str


# ─── Product ──────────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    name:                   str = Field(min_length=1, max_length=200)
    generic_id:             Optional[str] = None
    brand_id:               Optional[str] = None
    category_id:            str
    basic_sku_id:           str = ""
    barcode:                Optional[str] = None
    description:            Optional[str] = None
    image:                  Optional[str] = None
    specific_instructions:  Optional[str] = None
    is_discount_applicable: bool = False
    reorder_level:          int = Field(default=0, ge=0)
    sku_mappings:           list[SkuMapping] = []
    is_active:              bool = True

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("basic_sku_id") and data.get("unit_id"):
                data["basic_sku_id"] = data["unit_id"]
        return data


class ProductCreate(ProductBase):
    basic_sku_id: str = Field(min_length=1)


class ProductUpdate(BaseModel):
    name:                   Optional[str]              = None
    generic_id:             Optional[str]              = None
    brand_id:               Optional[str]              = None
    category_id:            Optional[str]              = None
    basic_sku_id:           Optional[str]              = None
    barcode:                Optional[str]              = None
    description:            Optional[str]              = None
    image:                  Optional[str]              = None
    specific_instructions:  Optional[str]              = None
    is_discount_applicable: Optional[bool]             = None
    reorder_level:          Optional[int]              = None
    sku_mappings:           Optional[list[SkuMapping]]  = None
    is_active:              Optional[bool]             = None


class ProductResponse(ProductBase, AuditMixin):
    id:             str
    generic_name:   str = ""
    brand_name:     str = ""
    category_name:  str = ""
    basic_sku_name: str = ""

    @model_validator(mode="before")
    @classmethod
    def _migrate_audit_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "last_modified_at" in data and "updated_at" not in data:
                data["updated_at"] = data.pop("last_modified_at")
            if "last_modified_by_id" in data and "updated_by_id" not in data:
                data["updated_by_id"] = data.pop("last_modified_by_id")
            if "last_modified_by_name" in data and "updated_by_name" not in data:
                data["updated_by_name"] = data.pop("last_modified_by_name")
        return data
