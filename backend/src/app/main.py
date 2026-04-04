from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import get_db, Collections
from app.api.v1 import (
    auth, users, branches, products, inventory,
    suppliers, purchase_orders, sales, prescriptions,
    patients, stock_transfer, staff, payroll,
    reports, notifications, audit_log, preferences,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: ensure indexes ────────────────────────────────────────────────
    # NOTE: When using Firestore via the PyMongo-compatible API, single-field
    # indexes are managed automatically by Firestore. Composite indexes must be
    # created through the Firebase console or firestore.indexes.json.
    # The create_index calls below are kept as a no-op safety net and are
    # silently skipped if the backend lacks index-creation permissions.
    try:
        db = get_db()
        db[Collections.USERS].create_index("email",  unique=True,  background=True)
        db[Collections.USERS].create_index([("email", 1), ("status", 1)], background=True)
    except Exception:
        pass  # Firestore manages indexes externally — skip if not permitted
    yield
    # ── Shutdown: connection pool closes itself ────────────────────────────────


app = FastAPI(
    title       = "PharmaOps API",
    description = "Multi-branch Pharmacy Management System",
    version     = "1.0.0",
    docs_url    = "/api/docs",
    redoc_url   = "/api/redoc",
    lifespan    = lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins     = settings.cors_origins,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth.router,             prefix=API_PREFIX)
app.include_router(users.router,            prefix=API_PREFIX)
app.include_router(branches.router,         prefix=API_PREFIX)
app.include_router(products.router,         prefix=API_PREFIX)
app.include_router(inventory.router,        prefix=API_PREFIX)
app.include_router(suppliers.router,        prefix=API_PREFIX)
app.include_router(purchase_orders.router,  prefix=API_PREFIX)
app.include_router(sales.router,            prefix=API_PREFIX)
app.include_router(prescriptions.router,    prefix=API_PREFIX)
app.include_router(patients.router,         prefix=API_PREFIX)
app.include_router(stock_transfer.router,   prefix=API_PREFIX)
app.include_router(staff.router,            prefix=API_PREFIX)
app.include_router(payroll.router,          prefix=API_PREFIX)
app.include_router(reports.router,          prefix=API_PREFIX)
app.include_router(notifications.router,    prefix=API_PREFIX)
app.include_router(audit_log.router,        prefix=API_PREFIX)
app.include_router(preferences.router,      prefix=API_PREFIX)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "PharmaOps API"}
