# PharmaOps — Claude Instructions

## Project

**Medi Guide Pharmacy** — multi-branch pharmacy management system.

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS — `frontend/`
- **Backend:** FastAPI + MongoDB — `backend/`

---

## Folder Structure

### Frontend

```
frontend/
├── src/
│   ├── app/                  # Routing + co-located feature code
│   │   ├── (auth)/           # Login
│   │   └── (pages)/          # Authenticated pages
│   │       ├── branches/
│   │       │   ├── components/   # BranchModal, BranchViewModal
│   │       │   ├── schemas.ts
│   │       │   └── page.tsx
│   │       ├── dashboard/
│   │       │   └── page.tsx
│   │       ├── profile/
│   │       │   ├── components/   # AvatarUpload, ChangePasswordModal
│   │       │   ├── schemas.ts
│   │       │   └── page.tsx
│   │       ├── settings/
│   │       │   └── page.tsx
│   │       ├── users/
│   │       │   ├── components/   # UserModal, UserViewModal, PasswordResetModal, GeneratedPasswordAlert
│   │       │   ├── schemas.ts
│   │       │   └── page.tsx
│   │       └── layout.tsx
│   ├── components/           # Shared reusable UI
│   │   ├── common/           # DataTable, FilterBar, ImportModal, Pagination, SearchBar
│   │   ├── layout/           # Header, Sidebar, Breadcrumb, ThemeToggle
│   │   └── ui/               # Button, Input, Modal, Card, Badge, StatusBadge, ConfirmModal
│   ├── hooks/                # useAuth, usePagination
│   ├── lib/                  # Shared utilities
│   │   ├── api-client.ts     # Axios instance + GET/POST/PATCH/DELETE helpers
│   │   ├── auth-options.ts   # NextAuth config
│   │   ├── badges.ts         # Badge variant mappings
│   │   ├── config.ts         # App & org branding config
│   │   ├── constants.ts      # Shared option arrays (roles, statuses, etc.)
│   │   ├── firebase.ts       # Firebase client SDK
│   │   ├── firebase-admin.ts # Firebase Admin SDK
│   │   ├── nav-config.ts     # Sidebar navigation structure
│   │   ├── toast.tsx         # Toast helper wrappers
│   │   └── utils.ts          # formatDate, formatPhoneNumber, cn, etc.
│   └── types/
│       ├── index.ts          # All TypeScript types & interfaces
│       └── next-auth.d.ts    # NextAuth type augmentation
└── public/                   # Static assets (logos, icons)
```

### Backend

```
backend/
├── src/
│   └── app/
│       ├── main.py           # FastAPI app, CORS, router registration
│       ├── core/
│       │   ├── config.py     # Pydantic settings (reads backend/.env)
│       │   ├── database.py   # MongoDB client & helpers
│       │   └── firebase_client.py
│       ├── api/
│       │   └── v1/           # One router file per domain module
│       │       ├── auth.py
│       │       ├── branches.py
│       │       ├── inventory.py
│       │       ├── notifications.py
│       │       ├── patients.py
│       │       ├── payroll.py
│       │       ├── preferences.py
│       │       ├── prescriptions.py
│       │       ├── products.py
│       │       ├── purchase_orders.py
│       │       ├── reports.py
│       │       ├── sales.py
│       │       ├── staff.py
│       │       ├── stock_transfer.py
│       │       ├── suppliers.py
│       │       ├── users.py
│       │       └── audit_log.py
│       ├── middleware/
│       │   ├── auth_middleware.py   # JWT decode, role enforcement
│       │   └── audit_middleware.py  # Audit log helper
│       ├── models/           # Pydantic request/response models (one file per domain)
│       │   ├── common.py
│       │   ├── branch.py
│       │   ├── inventory.py
│       │   ├── patient.py
│       │   ├── payroll.py
│       │   ├── preferences.py
│       │   ├── prescription.py
│       │   ├── product.py
│       │   ├── purchase_order.py
│       │   ├── sale.py
│       │   ├── staff.py
│       │   ├── stock_transfer.py
│       │   ├── supplier.py
│       │   └── user.py
│       └── utils/
│           ├── audit.py
│           └── password.py
└── scripts/
    └── seed_admin.py
```

---

## Development Commands

### Frontend

```bash
cd frontend
npm run dev       # http://localhost:3000
npm run build
npm run lint
```

### Backend

```bash
cd backend/src
uvicorn app.main:app --reload   # http://localhost:8000

# Or from backend/ root:
# Windows PowerShell:  $env:PYTHONPATH="src"; uvicorn app.main:app --reload
# macOS/Linux:         PYTHONPATH=src uvicorn app.main:app --reload
```

---

## Conventions

### General

- Path alias `@/*` resolves to `frontend/src/*`
- All shared constants, enums, option arrays → `src/lib/constants.ts`
- All TypeScript types & interfaces → `src/types/index.ts`
- All badge variant helpers → `src/lib/badges.ts`

### Adding a new module

> See **`CRUD_PAGE_GUIDE.md`** at the project root for the full page layout, code patterns, and a checklist.

1. Create `src/app/(pages)/<name>/components/` for modals and feature components
2. Create `src/app/(pages)/<name>/schemas.ts` for Zod schemas
3. Keep `src/app/(pages)/<name>/page.tsx` as a thin page entry point
4. Add corresponding FastAPI router at `backend/src/app/api/v1/<name>.py`
5. Add corresponding Pydantic models at `backend/src/app/models/<name>.py`

### Formatting rules

- Phone fields: `Controller` + `formatPhoneNumber` + `maxLength={12}` + regex `/^\d{3} \d{3} \d{4}$/`
- Date only: `yyyy-MM-dd`
- Date + time: `yyyy-MM-dd hh:mm a`
- Time: `hh:mm a`

### Forms

- Always use `react-hook-form` + `zodResolver` + Zod schema
- Schema and inferred types live in `app/(pages)/<domain>/schemas.ts`

### Pagination & sorting

- All list pages use `usePagination` — adds `page`, `page_size`, `sort_by`, `sort_dir`, `search` to query params
- Pages only add their own domain `filters` on top
- Backend list endpoints must accept `sort_by` and `sort_dir` and apply `.sort()` before `.skip().limit()`
- Whitelist valid sort fields in a `<DOMAIN>_SORT_FIELDS` set at the top of each router file

### Roles (least → most privileged)

`BRANCH_USER` → `BRANCH_MANAGER` → `BRANCH_ADMIN` → `MANAGER` → `ADMIN`

---

## API

All endpoints: `http://localhost:8000/api/v1/<resource>`

Docs: `http://localhost:8000/api/docs` (Swagger) | `http://localhost:8000/api/redoc`

---

## Environment Files

| File | Purpose |
|------|---------|
| `frontend/.env` | NextAuth, Firebase, API URL |
| `backend/.env` | MongoDB, JWT secret, CORS origins |
