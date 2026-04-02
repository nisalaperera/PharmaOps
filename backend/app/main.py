from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import (
    auth, users, branches, products, inventory,
    suppliers, purchase_orders, sales, prescriptions,
    patients, stock_transfer, staff, payroll,
    reports, notifications, audit_log,
)

settings = get_settings()

app = FastAPI(
    title       = "PharmaOps API",
    description = "Multi-branch Pharmacy Management System",
    version     = "1.0.0",
    docs_url    = "/api/docs",
    redoc_url   = "/api/redoc",
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


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "PharmaOps API"}
