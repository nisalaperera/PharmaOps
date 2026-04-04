import uuid
from functools import lru_cache
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.database import Database
from fastapi import HTTPException
from app.core.config import get_settings


@lru_cache
def get_mongo_client() -> MongoClient:
    settings = get_settings()
    return MongoClient(
        settings.mongodb_url,
        maxPoolSize              = 50,
        serverSelectionTimeoutMS = 5000,
        socketTimeoutMS          = 10000,
    )


def get_db() -> Database:
    settings = get_settings()
    return get_mongo_client()[settings.mongodb_db_name]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def new_id() -> str:
    """Generate a new unique string ID."""
    return str(uuid.uuid4())


def doc_to_dict(doc: dict | None) -> dict | None:
    """Convert MongoDB _id field to id string."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


def docs_to_list(docs) -> list[dict]:
    """Convert a MongoDB cursor to a list of dicts with id field."""
    return [doc_to_dict(doc) for doc in docs]


def get_doc_or_404(collection_name: str, doc_id: str, detail: str = "Not found") -> dict:
    """Fetch a document by ID or raise 404."""
    db  = get_db()
    doc = db[collection_name].find_one({"_id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail=detail)
    return doc_to_dict(doc)


def build_search_filter(search: str | None, fields: list[str]) -> dict:
    """Build a MongoDB $or regex filter for search across multiple fields."""
    if not search:
        return {}
    pattern = {"$regex": search, "$options": "i"}
    return {"$or": [{field: pattern} for field in fields]}


# ─── Collection names (single source of truth) ───────────────────────────────

class Collections:
    USERS           = "users"
    BRANCHES        = "branches"
    PRODUCTS        = "products"
    GENERICS        = "product_generics"
    BRANDS          = "product_brands"
    CATEGORIES      = "product_categories"
    UNITS           = "product_units"
    INVENTORY       = "inventory"
    SUPPLIERS       = "suppliers"
    PURCHASE_ORDERS = "purchase_orders"
    GRNS            = "goods_received_notes"
    SALES           = "sales"
    PRESCRIPTIONS   = "prescriptions"
    PATIENTS        = "patients"
    DOCTORS         = "doctors"
    STOCK_TRANSFERS = "stock_transfers"
    STAFF           = "staff"
    ATTENDANCE      = "attendance"
    PAYROLL         = "payroll"
    NOTIFICATIONS   = "notifications"
    AUDIT_LOGS      = "audit_logs"
    PREFERENCES     = "user_preferences"
