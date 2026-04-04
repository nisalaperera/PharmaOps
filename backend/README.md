# PharmaOps — Backend

FastAPI backend for the PharmaOps pharmacy management system.

## Tech Stack

| Tool | Purpose |
|------|---------|
| FastAPI | Web framework |
| MongoDB + PyMongo | Database |
| Pydantic v2 | Data validation & settings |
| python-jose | JWT authentication |
| bcrypt | Password hashing |
| ReportLab | PDF report generation |
| openpyxl | Excel export |

## Prerequisites

- Python 3.11+
- MongoDB instance (local or Atlas)

## Setup

1. **Create and activate a virtual environment**

   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS / Linux
   source .venv/bin/activate
   ```

2. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in all values in `.env` (see [Environment Variables](#environment-variables)).

4. **Run the development server**

   ```bash
   cd src
   uvicorn app.main:app --reload
   ```

   Or from the `backend/` root using `PYTHONPATH`:

   ```bash
   # Windows (cmd)
   set PYTHONPATH=src && uvicorn app.main:app --reload

   # Windows (PowerShell)
   $env:PYTHONPATH="src"; uvicorn app.main:app --reload

   # macOS / Linux
   PYTHONPATH=src uvicorn app.main:app --reload
   ```

   The API will be available at `http://localhost:8000`.

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=pharmaops

JWT_SECRET=
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=8

APP_ENV=development
ALLOWED_ORIGINS=http://localhost:3000
```

## API Documentation

| URL | Interface |
|-----|-----------|
| `http://localhost:8000/api/docs` | Swagger UI |
| `http://localhost:8000/api/redoc` | ReDoc |
| `http://localhost:8000/health` | Health check |

## Project Structure

```
backend/
├── src/
│   └── app/
│       ├── main.py             # FastAPI app, CORS, router registration
│       ├── core/
│       │   ├── config.py       # Settings via pydantic-settings
│       │   ├── database.py     # MongoDB connection & helpers
│       │   └── firebase_client.py  # Firebase Admin SDK client
│       ├── api/
│       │   └── v1/             # One file per domain module
│       ├── middleware/
│       │   ├── auth_middleware.py   # JWT decode, role enforcement
│       │   └── audit_middleware.py  # Audit log helper
│       ├── models/             # Pydantic request/response models
│       └── utils/              # Password hashing, helpers
├── scripts/                    # Seed scripts and one-off tools
└── requirements.txt
```

## Conventions

- **New router** — add `<name>.py` to `src/app/api/v1/`, register it in `main.py`
- **Core imports** — always import from `app.core.config`, `app.core.database`, `app.core.firebase_client`
- **Sorting** — list endpoints must accept `sort_by` and `sort_dir` query params; whitelist valid fields in a `<DOMAIN>_SORT_FIELDS` set; apply `.sort()` before `.skip().limit()`
- **Pagination** — use `page` + `page_size`; return `PaginatedResponse[T]` with `total`, `total_pages`
- **Running scripts** — `scripts/seed_admin.py` sets `PYTHONPATH` to `src/` automatically

## API Prefix

All endpoints are prefixed with `/api/v1`.

| Router | Prefix |
|--------|--------|
| auth | `/api/v1/auth` |
| users | `/api/v1/users` |
| branches | `/api/v1/branches` |
| products | `/api/v1/products` |
| inventory | `/api/v1/inventory` |
| suppliers | `/api/v1/suppliers` |
| purchase_orders | `/api/v1/purchase-orders` |
| sales | `/api/v1/sales` |
| prescriptions | `/api/v1/prescriptions` |
| patients | `/api/v1/patients` |
| stock_transfer | `/api/v1/stock-transfers` |
| staff | `/api/v1/staff` |
| payroll | `/api/v1/payroll` |
| reports | `/api/v1/reports` |
| notifications | `/api/v1/notifications` |
| audit_log | `/api/v1/audit-log` |
