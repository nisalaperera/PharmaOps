from google.cloud import firestore as gc_firestore
from google.oauth2 import service_account
from functools import lru_cache
from app.config import get_settings


@lru_cache
def get_firestore_client() -> gc_firestore.Client:
    settings = get_settings()

    credentials = service_account.Credentials.from_service_account_info(
        {
            "type":          "service_account",
            "project_id":    settings.firebase_project_id,
            "client_email":  settings.firebase_client_email,
            "private_key":   settings.firebase_private_key.replace("\\n", "\n"),
            "token_uri":     "https://oauth2.googleapis.com/token",
        },
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )

    return gc_firestore.Client(
        project=settings.firebase_project_id,
        credentials=credentials,
        database=settings.firestore_database,
    )


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
