# 🏥 PharmaOps — Pharmacy Chain Management System
### Claude Code Architect Prompt (v5 — MongoDB edition)

> **PharmaOps — run every branch from one place.** A modular, multi-branch pharmacy chain platform spanning POS & dispensing terminals, procurement (orders, GRN, channels), inventory, prescriptions, HR & payroll, and full double-entry accounting. Built on **Next.js + FastAPI + MongoDB**.

## ROLE & MISSION

You are a **Senior Software Architect**. Your task is to design and scaffold **PharmaOps**, a **production-grade, modular, multi-branch Pharmacy Chain Management System**, using **Next.js 14 (App Router)** for the frontend, **Python FastAPI** for the backend, and **MongoDB** (via the Beanie/Motor async ODM) as the database.

This is a **single pharmacy chain** with **multiple branches** under one owner. Data is stored in **shared MongoDB collections with a `branch_id` field for branch-level isolation** (not separate databases per branch on the same node). Think deeply about domain modeling, document/embed boundaries, data flow, audit trails, and branch-level scoping before writing a single line of code.

---

## TECH STACK

### Frontend
- **Framework:** Next.js 14 (App Router, TypeScript)
- **UI Library:** shadcn/ui + Radix UI primitives
- **Styling:** Tailwind CSS with **dark/light mode toggle** (`next-themes`, CSS variables)
- **State Management:** Zustand (global: active branch, theme, session) + TanStack Query (server state)
- **Forms:** React Hook Form + Zod validation
- **Charts/Analytics:** Recharts
- **Auth:** NextAuth.js (JWT + role-based + branch-scoped session)
- **HTTP Client:** Axios — auto-injects `Authorization` + `X-Branch-ID` headers on every request
- **Icons:** Lucide React
- **Print/PDF:** `react-to-print` + `@react-pdf/renderer`
- **Excel Export:** `xlsx` (SheetJS)
- **CSV:** `papaparse`

### Backend
- **Framework:** Python FastAPI (latest)
- **Database:** **MongoDB 7** (primary) + Redis 7 (caching/sessions)
- **ODM:** **Beanie** (async, built on **Motor**) with Pydantic v2 document models; no SQL/Alembic — schema is code-defined, indexes created on startup
- **Auth:** JWT (`python-jose`) + OAuth2PasswordBearer
- **Validation:** Pydantic v2 (Beanie `Document` models)
- **Task Queue:** Celery + Redis (expiry alerts, low stock, end-of-day, sync, backups)
- **API Docs:** FastAPI auto-generated OpenAPI
- **Testing:** Pytest + HTTPX + `mongomock-motor` (or a test MongoDB)
- **Audit Logging:** Beanie event hooks (`before_save` / `after_save` / on delete) → `audit_logs` collection
- **Money:** `Decimal128` (bson) for all monetary fields; quantities as `int`
- **Transactions:** multi-document **ACID transactions** (MongoDB replica set / single-node replica set) for operations that must be atomic (sale + payment + stock deduction; PO/SO conversion; journal entry posting)

### Infrastructure & Deployment
- **Target:** on-premise **standalone Windows install per branch** (one Windows machine at each pharmacy). See the **Deployment** section for full details.
- All long-running components run as **Windows Services** (via **NSSM**): backend (FastAPI/uvicorn), frontend (Next.js), Redis, Celery worker, Celery beat — auto-start on boot, auto-restart on crash.
- **MongoDB** installed natively on Windows (its own service).
- A **single installer** bundles the Python + Node runtimes (no separate installs), configures MongoDB, runs migrations + seed on first run, registers all services, and creates a kiosk desktop shortcut.
- Each branch runs self-contained and **periodically syncs to a central HQ server** for consolidated reporting (see the **Branch Sync** module).
- Docker/Docker Compose remains an optional path for development only; production is Windows-Services-based.
- `.env` files with Pydantic Settings; structured logging (`structlog`) to rotating files under the install directory.

---

## DATA MODELING ON MONGODB (read this before interpreting the models)

All entities below are described with relational-style notation for clarity, but the implementation is **MongoDB with Beanie ODM**. Translate as follows:

- **Collections, not tables.** Each "model" is a MongoDB **collection** of BSON documents. Where the text says "table", read "collection".
- **`id: UUID (PK)`** → the document `_id`. Use a **UUID** (stored as BSON binary/UUID) as `_id` so IDs are globally unique across branches (critical for offline branch sync merging into central HQ).
- **`X_id: UUID (FK → Y)`** → a stored **reference** field holding the related document's `_id`. There are **no foreign-key constraints**; referential integrity is **enforced in the service layer**. Use Beanie `Link`/`BackLink` or plain reference fields as appropriate. Index every reference field used in queries.
- **Embed vs reference:**
  - **Embed** child data that is owned-by and read-with the parent and is bounded in size — e.g. invoice **line items**, payment **allocations**, journal **lines**, prescription **items**, PO/SO **items**, contacts on a chain/branch/supplier. These become embedded sub-documents/arrays on the parent document (still shown as separate "models" for clarity).
  - **Reference** independently-queried or unbounded entities — e.g. Product, Customer, Supplier, Doctor, Patient, InventoryBatch, Ledger, JournalEntry, SaleInvoice, Prescription.
  - When in doubt, prefer referencing for anything reported on independently or growing without bound.
- **`object` / embedded document** replaces `JSONB`; **`array<...>`** / BSON arrays replace `ARRAY(TEXT)`.
- **Money** = `Decimal128`; **quantities** = `int`; dates/times = BSON `date`.
- **No Alembic/migrations.** Schema is defined by Beanie `Document` classes. On startup, the app **creates collections + indexes** (unique indexes for `(_id)`, business keys like `invoice_number`, `(branch_id, code)`, compound indexes for common filters, and TTL/partial indexes where useful). A lightweight **versioned data-migration runner** handles structural data changes between releases (record applied versions in a `schema_migrations` collection).
- **Atomicity** = multi-document **ACID transactions** (run MongoDB as a single-node **replica set** even on a branch box, so transactions are available). Every operation that spans documents and must be all-or-nothing (sale + payment + FIFO stock deduction; PO→PI / SO→SI conversion; cash-session close; POS settlement; journal posting; backup/restore bookkeeping) runs inside a transaction.
- **Soft deletes** (`is_active=false`) and **audit fields** (`created_by/updated_by/created_at/updated_at`) live on every document, same as before.
- **Branch isolation:** every document carries `branch_id`; every query filters by the request's branch context (never trust `branch_id` from the body). This is the MongoDB equivalent of the row-level isolation described elsewhere.
- **Double-entry accounting** still holds (debits = credits): a `JournalEntry` document **embeds its balanced lines**; ledger balances are updated within the same transaction.

> Throughout the rest of this document, the relational vocabulary ("table", "FK", "row", "JSONB", "NUMERIC") is shorthand — apply the mappings above when implementing.

---

## GLOBAL FORMATTING STANDARDS

These rules apply **everywhere** in the application — frontend display, print outputs, PDF exports, and CSV exports. Implement as shared utility functions and reusable input components.

### Display Formatting
| Data Type | Format | Example |
|---|---|---|
| Date only | `yyyy-MM-dd` | `2024-06-15` |
| Date + time | `yyyy-MM-dd hh:mm a` | `2024-06-15 02:45 PM` |
| Time only | `hh:mm a` | `02:45 PM` |
| Phone | `### ### ####` (regex `/^\d{3} \d{3} \d{4}$/`) | `077 123 4567` |
| Amounts (currency) | `###,###.##` (2 decimal places, comma thousands) | `1,234,567.50` |
| Other Numbers (qty, count) | `###,###` (comma thousands, no decimals) | `1,234` |

> Use `date-fns` tokens on the frontend. Note `hh` = 12-hour clock and `a` = AM/PM marker. List/table date columns use **Date only**; timestamps such as `created_at`, `sale_date`, `payment_date` use **Date + time**; operating-hours-style fields use **Time only**.

### Input Formatting (`FormattedInput` component)
- **Amount fields** and **quantity fields** use `<input type="text">` — NOT `type="number"`
- On keystroke: allow only digits and `.` (dot); reject all other characters silently
- On blur (`onBlur`): format the raw value to the display format above
- On focus (`onFocus`): strip formatting to raw numeric value for editing
- Zod validation runs on the raw numeric value
- Implement as a single reusable `FormattedInput` component with a `variant` prop: `"amount" | "number"`

### Phone Input (`PhoneInput` component)
- Use `<input type="text">`; allow only digits on keystroke (strip spaces internally)
- On blur, auto-format to `### ### ####` (insert spaces after the 3rd and 6th digit)
- Validate against `/^\d{3} \d{3} \d{4}$/` via Zod; show inline error if it doesn't match
- Store the formatted value (`### ### ####`) in the database for consistency
- Applies to every phone/mobile field: `User.phone`, all `*Contact.mobile_1/mobile_2/whatsapp/landline`, `Supplier.phone`, `Patient.phone`, `Customer.phone`, `Doctor.phone`, etc.

### Date / Time Input
- Date fields use a date picker that emits/displays `yyyy-MM-dd`
- Date + time fields use a date-time picker displaying `yyyy-MM-dd hh:mm a`
- Time-only fields use a time picker displaying `hh:mm a`
- All values serialized to ISO 8601 for the API; formatting is applied only on display

### Backend
- All `Decimal` fields stored with `Decimal128` in MongoDB
- API responses return amounts as strings in formatted form: `"1,234,567.50"` OR as raw decimals — choose one consistently (recommend raw decimal; format on frontend only)

---

## GLOBAL CRUD PAGE STANDARD

**Every** list/CRUD page in the application must implement the following features. Build a reusable `DataTable` component that encapsulates all of this behaviour.

### 1. Toolbar (top of page)
```
[+ Create New]  [Search: ___________]  [Filters ▼]  [Import ▼]  [Export ▼]
```

### 2. Search
- Full-text search on **main identifier attributes** of the model (defined per module)
- Single search input, debounced 300ms, triggers API call with `?search=`

### 3. Filter Panel (collapsible drawer/popover)
- Per-module filter fields (FK dropdowns, date range pickers, status enums, boolean toggles)
- "Apply Filters" + "Clear All" buttons
- Active filter count badge on the "Filters" button

### 4. Import (dropdown menu)
- **Download Template** — downloads a pre-filled CSV with column headers + 1 example row
- **Import from CSV** — opens `ImportModal`:
  1. File picker (`.csv` only)
  2. Parse CSV client-side with `papaparse`
  3. Show preview table with **row-by-row inline validation** — each invalid cell highlighted red with tooltip showing the error
  4. Valid rows shown in green; invalid rows in red
  5. User can fix errors in-place (editable cells in the preview) or remove invalid rows
  6. "Confirm Import" button only active when 0 invalid rows remain
  7. On confirm: POST to `/api/{module}/import/` with array of validated objects
  8. Show import result: "X records imported successfully"

### 5. Export (dropdown menu — active on any selection OR full table)
Exports respect **current filters + search** (not just selected rows, unless rows are selected):
- **Export CSV** — `papaparse` stringify → download `.csv`
- **Export Excel** — SheetJS → download `.xlsx` with formatted headers
- **Export PDF** — `@react-pdf/renderer` → tabular PDF with branch logo + date range header

### 6. Pagination
- Page size selector: **10 | 25 | 50 | 100 | All**
- Page navigation: `« Prev  [1] [2] [3] … [N]  Next »`
- Shows: `Showing 1–25 of 342 records`

### 7. Row-Level Selection
- Checkbox column as first column
- **Select All on page** checkbox in header
- When page-level Select All is checked: show banner:
  > *"25 records on this page are selected. Select all 342 records?"*
  - "Select All 342" link → selects entire filtered dataset (sends `select_all=true` flag to bulk API)
- Selected count badge: `3 selected`

### 8. Bulk Actions Bar (appears when ≥1 row selected)
```
[3 selected]  [Bulk Export ▼]  [Bulk Update]  [Delete Selected]  [✕ Clear]
```
- **Bulk Export:** CSV / Excel / PDF of selected rows only
- **Bulk Update:** Opens `BulkUpdateModal` — shows **only FK / enum / status fields** for that model as dropdowns. Only filled fields are applied. Confirmation before saving. Backend endpoint: `PATCH /api/{module}/bulk-update/`
- **Delete Selected:** Opens `ConfirmDialog` → sets `is_active = false` on all selected. Backend: `DELETE /api/{module}/bulk-delete/` with list of IDs (or `select_all=true`)

### 9. Record-Level Actions (per row, last column)
- **View** → opens `{Model}ViewModal` (read-only)
- **Edit** → opens `{Model}FormModal` in edit mode
- **Delete** → opens `ConfirmDialog` → soft delete

### 10. Modal Architecture (per module)
All modals for a module live in the **same UI folder** alongside the list component:
```
components/modules/{module}/
  {Model}List.tsx          # table + toolbar
  {Model}FormModal.tsx     # Create + Edit (mode prop: "create" | "edit")
  {Model}ViewModal.tsx     # Read-only detail view
  {Model}ImportModal.tsx   # Import flow
  {Model}BulkUpdateModal.tsx
```

### 11. Common Shared Components
```
components/shared/
  DataTable.tsx            # core table with selection, pagination, sort
  ConfirmDialog.tsx        # reusable: title, message, onConfirm, variant (danger|warning)
  FormattedInput.tsx       # amount/number text input with formatting
  PhoneInput.tsx           # phone text input, formats to ### ### ####, regex-validated
  DateTimeField.tsx        # date / date-time / time picker (variant prop)
  FilterPanel.tsx          # collapsible filter drawer wrapper
  BulkActionsBar.tsx       # bulk action toolbar
  ImportModal.tsx          # generic import flow (accepts column config)
  ExportMenu.tsx           # CSV/Excel/PDF export dropdown
  StatusBadge.tsx
  AuditBadge.tsx           # shows created_by, updated_by, timestamps
  EmptyState.tsx
  SearchInput.tsx
```

---

## MULTI-BRANCH ARCHITECTURE

### Core Concept
- One **Chain** (top-level owner entity)
- Multiple **Branches** under the chain
- All documents carry `branch_id: UUID (ref → Branch)` for branch-level isolation
- **Global users** (`CHAIN_ADMIN`, `CHAIN_MANAGER`) — no branch restriction, use `X-Branch-ID` header to set context
- **Branch users** (`BRANCH_MANAGER`, `PHARMACIST`, `CASHIER`) — locked to their assigned branch; backend rejects requests for other branches
- FastAPI dependency `get_current_branch()` resolves and enforces branch from header

---

## SHARED BASE DOCUMENT (ALL COLLECTIONS)

Every Beanie document inherits a common `AuditDocument` base:

```python
class AuditDocument(Document):          # Beanie Document base
    id: UUID = Field(default_factory=uuid4, alias="_id")
    branch_id: UUID                      # reference → Branch; indexed; isolation key
    created_at: datetime                 # utcnow on insert
    updated_at: datetime                 # refreshed on every save
    created_by: UUID                     # reference → User; auto from JWT, never from body
    updated_by: UUID                     # reference → User; auto from JWT, never from body
    is_active: bool = True               # soft-delete flag
    # Settings: indexes on branch_id (+ compound business indexes per collection)
```

---

## FULL AUDIT LOG

`audit_logs` collection — every create, update, delete across all modules:

```
id: UUID (_id)
branch_id: UUID (ref → Branch)
collection_name: str
document_id: UUID
action: Enum(CREATE, UPDATE, DELETE)
changed_by: UUID (ref → User)
changed_at: datetime
old_values: object | null      # embedded BSON document
new_values: object | null      # embedded BSON document
ip_address: str | null
user_agent: str | null
```

Captured via Beanie event hooks (`before_save`, `after_save`, and delete hooks / repository wrapper) in `core/audit.py`.

Endpoint: `GET /audit-logs/?collection=&document_id=&user_id=&start=&end=` (CHAIN_ADMIN only)

---

## PROJECT STRUCTURE

### Backend — `/backend`
```
backend/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── database.py              # Motor client + Beanie init (register all Documents, build indexes)
│   │   ├── redis.py
│   │   ├── dependencies.py          # get_current_user, get_current_branch (no get_db session — Beanie is global)
│   │   ├── transactions.py          # async transaction helper (Motor sessions)
│   │   └── audit.py                 # Beanie event hooks → audit_logs
│   ├── modules/
│   │   ├── chain/                   # Chain, ChainContact
│   │   ├── branches/                # Branch, BranchContact, BranchSettings
│   │   ├── auth/
│   │   ├── users/
│   │   ├── products/
│   │   │   ├── documents.py         # Beanie Documents: ProductCategory, ProductSKU, ProductSKUMapping,
│   │   │   │                        # StockLocation, ProductBrand, ProductGeneric, Product
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   └── schemas.py
│   │   ├── suppliers/               # Supplier, SupplierContact, DistributionChannel,
│   │   │                            # ChannelContact, ChannelPromotion, ChannelProductMapping,
│   │   │                            # ChannelProductMappingPromotion, ChannelRepVisit,
│   │   │                            # SupplierPayment(+embedded allocations),
│   │   │                            # PurchaseCreditNote(+embedded items)
│   │   ├── inventory/               # InventoryBatch, StockMovement (Stock In/Out), StockTransfer(+items)
│   │   ├── purchase_invoices/       # PurchaseOrder(+embedded items+promo snapshots),
│   │   │                            # PurchaseInvoice(+embedded items)
│   │   ├── prescriptions/           # Doctor, Patient, Prescription(+embedded items),
│   │   │                            # PrescribedItemMapping (learned product suggestions)
│   │   ├── customers/               # Customer, CustomerPatient, CustomerPayment(+embedded allocations)
│   │   ├── sale_invoices/           # SaleOrder(+embedded items/prescriptions/reservations),
│   │   │                            # SaleInvoice(+embedded items/payments-allocations/prescriptions),
│   │   │                            # SaleCreditNote(+embedded items)
│   │   ├── hr/                      # StaffMember(+embedded qualifications/documents/allowances/deductions),
│   │   │                            # StaffAttendance, PayrollRun, Payslip(+embedded lines)
│   │   ├── accounts/                # ChartOfAccount, Ledger, CashRegistry, CashRegistrySession,
│   │   │                            # POSTerminal, POSSettlement(+embedded items), BankAccount,
│   │   │                            # ChequeBook, ChequeLeaf, JournalEntry(+embedded lines),
│   │   │                            # FundTransfer, ExpenseCategory, Expense
│   │   ├── reports/
│   │   ├── notifications/
│   │   ├── sync/                    # SyncState, SyncLog, up/down delta sync, HQ ingest
│   │   ├── backups/                 # BackupConfig, BackupRecord, RestoreRecord, backup/restore engine
│   │   └── audit/
│   ├── shared/
│   │   ├── base_document.py         # AuditDocument (Beanie base)
│   │   ├── base_schema.py
│   │   ├── pagination.py
│   │   ├── invoice_sequence.py      # InvoiceSequence document + atomic generator (findOneAndUpdate $inc)
│   │   └── exceptions.py
│   └── data_migrations/             # versioned data-migration runner (schema_migrations collection)
├── tests/
├── Dockerfile
├── requirements.txt
└── .env.example
```

### Frontend — `/frontend`
```
frontend/
├── app/
│   ├── layout.tsx                    # ThemeProvider + SessionProvider + QueryProvider
│   ├── (auth)/login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx                # Sidebar + Topbar + BranchSwitcher
│       ├── dashboard/page.tsx
│       ├── chain/page.tsx            # Chain settings + contacts
│       ├── branches/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx         # Branch detail + contacts + settings
│       ├── products/
│       │   ├── page.tsx              # Product list
│       │   ├── categories/page.tsx   # Category tree manager
│       │   ├── skus/page.tsx
│       │   ├── brands/page.tsx
│       │   └── generics/page.tsx
│       ├── stock-locations/page.tsx
│       ├── inventory/
│       │   ├── page.tsx
│       │   ├── stock-in/page.tsx
│       │   ├── stock-out/page.tsx
│       │   ├── movements/page.tsx
│       │   └── transfers/page.tsx
│       ├── suppliers/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── purchase-orders/
│       │   ├── page.tsx
│       │   ├── terminal/page.tsx        # 🖥️ Order Terminal (rep visit → PO) — full-screen
│       │   └── [id]/page.tsx            # PO detail + convert to invoice
│       ├── purchase-invoices/
│       │   ├── page.tsx
│       │   ├── new/page.tsx
│       │   ├── terminal/page.tsx        # 🖥️ Purchase Terminal (GRN) — full-screen, own shell
│       │   └── [id]/page.tsx
│       ├── purchase-credit-notes/page.tsx
│       ├── supplier-payments/page.tsx
│       ├── prescriptions/
│       │   ├── page.tsx
│       │   ├── [id]/page.tsx             # detail + dispense panel
│       │   ├── [id]/dispense/page.tsx    # 🖥️ full-screen dispensing terminal
│       │   ├── doctors/page.tsx
│       │   └── patients/page.tsx
│       ├── customers/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── customer-payments/page.tsx
│       ├── sale-orders/
│       │   ├── page.tsx
│       │   ├── terminal/page.tsx     # 🖥️ Sale Order Terminal (quotation/pre-order) — full-screen
│       │   └── [id]/page.tsx         # order detail + convert to invoice
│       ├── sale-invoices/
│       │   ├── page.tsx
│       │   ├── new/page.tsx          # standard sale form
│       │   ├── terminal/page.tsx     # 🖥️ Sale Terminal (POS) — full-screen, own shell
│       │   └── [id]/page.tsx
│       ├── sale-credit-notes/page.tsx
│       ├── hr/
│       │   ├── staff/
│       │   │   ├── page.tsx
│       │   │   └── [id]/page.tsx        # profile: qualifications, documents, allowances, deductions
│       │   ├── attendance/page.tsx      # clock in/out + daily grid
│       │   ├── payroll/
│       │   │   ├── page.tsx             # payroll runs list
│       │   │   └── [id]/page.tsx        # run detail + payslips
│       │   └── payslips/[id]/page.tsx   # single payslip view/print
│       ├── accounts/
│       │   ├── chart-of-accounts/page.tsx
│       │   ├── ledgers/
│       │   │   ├── page.tsx
│       │   │   └── [id]/page.tsx         # ledger statement
│       │   ├── cash-registries/page.tsx  # registries + open/close sessions
│       │   ├── pos-terminals/
│       │   │   ├── page.tsx
│       │   │   └── settlements/page.tsx
│       │   ├── bank-accounts/page.tsx
│       │   ├── cheque-books/
│       │   │   ├── page.tsx
│       │   │   └── [id]/page.tsx         # leaves
│       │   ├── journal-entries/page.tsx
│       │   ├── fund-transfers/page.tsx
│       │   ├── expenses/
│       │   │   ├── page.tsx
│       │   │   └── categories/page.tsx
│       │   └── reports/
│       │       ├── trial-balance/page.tsx
│       │       └── balance-sheet/page.tsx
│       ├── reports/page.tsx
│       ├── notifications/page.tsx
│       ├── audit-log/page.tsx
│       └── settings/
│           ├── chain/page.tsx
│           ├── branch/page.tsx
│           ├── sync/page.tsx          # Sync Now + status, last run, pending deltas, logs
│           └── backup/page.tsx        # Backup Now, schedule + retention config, history, restore
├── components/
│   ├── ui/                           # shadcn/ui primitives
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   ├── BranchSwitcher.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── TerminalShell.tsx          # minimal full-screen shell (no sidebar) for both terminals
│   │   ├── FullscreenToggle.tsx       # Fullscreen API toggle button
│   │   └── PageHeader.tsx
│   ├── shared/
│   │   ├── DataTable.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── FormattedInput.tsx        # variant: "amount" | "number"
│   │   ├── PhoneInput.tsx            # formats to ### ### ####, regex-validated
│   │   ├── DateTimeField.tsx         # variant: "date" | "datetime" | "time"
│   │   ├── NumericKeypad.tsx         # on-screen keypad for qty/discount (terminals)
│   │   ├── useKeyboardShortcuts.ts   # shared F-key shortcut hook for both terminals
│   │   ├── FilterPanel.tsx
│   │   ├── BulkActionsBar.tsx
│   │   ├── ImportModal.tsx
│   │   ├── ExportMenu.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── AuditBadge.tsx
│   │   ├── EmptyState.tsx
│   │   └── SearchInput.tsx
│   └── modules/
│       ├── chain/
│       │   ├── ChainFormModal.tsx
│       │   ├── ChainViewModal.tsx
│       │   └── ChainContactFormModal.tsx
│       ├── branches/
│       │   ├── BranchList.tsx
│       │   ├── BranchFormModal.tsx
│       │   ├── BranchViewModal.tsx
│       │   ├── BranchContactFormModal.tsx
│       │   └── BranchSettingsForm.tsx
│       ├── products/
│       │   ├── ProductList.tsx
│       │   ├── ProductFormModal.tsx
│       │   ├── ProductViewModal.tsx
│       │   ├── ProductImportModal.tsx
│       │   ├── ProductBulkUpdateModal.tsx
│       │   ├── CategoryTreeManager.tsx
│       │   ├── SKUList.tsx / SKUFormModal.tsx / SKUViewModal.tsx
│       │   ├── BrandList.tsx / BrandFormModal.tsx / BrandViewModal.tsx
│       │   └── GenericList.tsx / GenericFormModal.tsx / GenericViewModal.tsx
│       ├── stock-locations/
│       │   ├── StockLocationList.tsx
│       │   ├── StockLocationFormModal.tsx
│       │   └── StockLocationViewModal.tsx
│       ├── suppliers/ ...                # incl. ChannelPromotions, ChannelProductMappings, ChannelRepVisits managers
│       ├── inventory/ ...
│       ├── purchase-orders/ ...          # incl. OrderTerminal/ (MappedProductRow, ReorderIndicator, CompetitorPricing, PromotionTagPicker, RecentInvoicesPanel, ReturnsPanel)
│       ├── purchase-invoices/ ...        # incl. PurchaseTerminal/ (GRN: ScanLine, RunningTotals, FinalizePanel)
│       ├── prescriptions/ ...            # incl. DispensingTerminal/ (ItemSuggestions[4 options], MappingFallback, DaysNeededFields, LabelPreview)
│       ├── customers/ ...
│       ├── sale-orders/ ...              # incl. SaleOrderTerminal/ (ProductGrid, QuotedPriceLine, ValidityFields, ReservationToggle)
│       └── sale-invoices/ ...            # incl. SaleTerminal/ (ProductGrid, CartPanel, QuickPay, ParkedSales, KeypadOverlay)
├── lib/
│   ├── api/
│   │   ├── client.ts
│   │   └── endpoints/
│   ├── hooks/
│   ├── store/
│   │   ├── useAuthStore.ts
│   │   ├── useBranchStore.ts
│   │   └── useThemeStore.ts
│   ├── utils/
│   │   ├── format.ts                # formatDate, formatDateTime, formatTime, formatPhone, formatAmount, formatNumber, parseFormattedNumber
│   │   └── export.ts                # CSV/Excel/PDF export helpers
│   └── validations/
├── types/
├── public/
├── Dockerfile
├── next.config.ts
└── .env.local.example
```

---

## MODULES & DATA MODELS

### 1. 🏢 Chain Module

#### Chain
```
id: UUID (PK)
name: str
logo_url: str | null
default_currency: str           # e.g., "LKR"
invoice_prefix: str             # e.g., "PHARMAOPS"
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```
> Note: `default_timezone`, `low_stock_threshold`, `expiry_alert_days` are **removed** from Chain — managed per branch via BranchSettings.

#### ChainContact
```
id: UUID (PK)
chain_id: UUID (FK → Chain)
identifier: str                 # e.g., "General", "Managing Director", "Finance"
title: str                      # Mr, Mrs, Dr, Prof, etc.
first_name: str
last_name: str
mobile_1: str
mobile_2: str | null
whatsapp: str | null            # can be same as mobile_1 or mobile_2
landline: str | null
email: str | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

---

### 2. 🏪 Branch Module

#### Branch
```
id: UUID (PK)
chain_id: UUID (FK → Chain)
name: str
code: str (unique)              # e.g., "BR01"
address: str
city: str | null                # optional
phone: str | null               # optional
email: str | null               # optional
license_number: str
operating_hours: str | null     # optional, e.g., "Mon-Sat 08:00-22:00"
branch_manager_id: UUID (FK → User) | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### BranchContact
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
identifier: str                 # e.g., "General", "Branch Manager", "Pharmacist"
title: str
first_name: str
last_name: str
mobile_1: str
mobile_2: str | null
whatsapp: str | null
landline: str | null
email: str | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### BranchSettings
```
id: UUID (PK)
branch_id: UUID (FK → Branch, unique)
currency: str | null
logo_url: str | null
low_stock_threshold: int | null
expiry_alert_days: int | null
loyalty_points_rate: Decimal | null
tax_enabled: bool (default False)
invoice_footer_text: str | null

# Master lists — branch-managed; used as dropdown sources in ProductGeneric forms
storage_conditions: str[]       # e.g., ["Store below 25°C", "Keep in dry place", "Refrigerate 2–8°C"]
special_instructions: str[]     # e.g., ["Keep out of reach of children", "Avoid sunlight"]
dosage_instructions: str[]      # e.g., ["Take after meals", "Take with water", "Do not crush"]

# HR / Payroll settings (chain-level defaults; overridable per branch). All rates configurable, never hardcoded.
standard_daily_hours: Decimal(4,2) | null    # e.g. 8.00
working_days_per_month: int | null           # e.g. 26
ot_rate_multiplier: Decimal(5,2) | null      # e.g. 1.50
epf_employee_rate: Decimal(5,2) | null       # e.g. 8.00 (%)
epf_employer_rate: Decimal(5,2) | null       # e.g. 12.00 (%)
etf_employer_rate: Decimal(5,2) | null       # e.g. 3.00 (%)
paye_tax_slabs: array<object> | null                 # [{ "upto": 100000, "rate": 0 }, { "upto": 150000, "rate": 6 }, ...]

created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

> `storage_conditions`, `special_instructions`, `dosage_instructions` stored as native BSON arrays in MongoDB. These define the selectable options when creating/editing a `ProductGeneric`. Users pick from this list (not free-type).

---

### 3. 👤 Auth & Users Module

**Roles:** `CHAIN_ADMIN`, `CHAIN_MANAGER`, `BRANCH_MANAGER`, `PHARMACIST`, `CASHIER`

```
id: UUID (PK)
email: str (unique globally)
title: str | null
first_name: str
last_name: str
phone: str | null
role: Enum(CHAIN_ADMIN, CHAIN_MANAGER, BRANCH_MANAGER, PHARMACIST, CASHIER)
branch_id: UUID (FK → Branch) | null    # null = global user
is_active: bool
password_hash: str
last_login: datetime | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**Endpoints:**
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/switch-branch/{branch_id}` — global users only
- `GET /users/`
- `POST /users/`
- `GET /users/me`
- `PATCH /users/{id}`
- `DELETE /users/{id}` — soft delete
- `POST /users/import/` — bulk import
- `PATCH /users/bulk-update/` — bulk FK/role update
- `DELETE /users/bulk-delete/` — bulk soft delete

---

### 4. 🗂️ Product Module (Fully Restructured)

The Product module is built on **five supporting models** before the core `Product` model. `MedicineDetail` is **fully removed** — all medicine-specific attributes live on `ProductGeneric`.

---

#### 4a. ProductCategory (unlimited-depth tree)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
parent_id: UUID (FK → ProductCategory) | null    # null = root
name: str
slug: str (unique per branch)
icon: str | null                 # Lucide icon name or emoji
color: str | null                # hex color e.g. "#0F6CBD"
level: int                       # computed: 0 = root
path: str                        # materialized path: "uuid1.uuid2.uuid3"
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `name`, `slug`
**CRUD filter fields:** `parent_id`, `is_active`

---

#### 4b. ProductSKU (unit of measure)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
name: str                        # e.g., "Tablet", "Sachet", "Bottle"
plural: str                      # e.g., "Tablets", "Sachets", "Bottles"
sku_type: Enum(COUNT, WEIGHT, VOLUME, LENGTH)
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `name`, `plural`
**CRUD filter fields:** `sku_type`, `is_active`

---

#### 4c. StockLocation (shelf/rack location, branch-scoped)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
name: str                        # e.g., "Rack A - Shelf 2"
code: str (unique per branch)    # e.g., "RA-S2"
description: str | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `name`, `code`
**CRUD filter fields:** `is_active`

---

#### 4d. ProductBrand
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
name: str
manufacturer: str | null
country_of_origin: str | null
return_expiry_before: int (default 180)
  # Days before expiry within which supplier accepts purchase returns.
  # E.g., 180 = product expiring within 6 months is returnable.
  # Values represent: 0=On Expiry, 30=1 Month, 60=2 Months, 180=6 Months, etc.
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `name`, `manufacturer`
**CRUD filter fields:** `country_of_origin`, `is_active`

---

#### 4e. ProductGeneric (replaces MedicineDetail entirely)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
name: str                                # generic drug/product name e.g., "Amoxicillin"
description: str | null
dosage_form: Enum(TABLET, CAPSULE, SYRUP, INJECTION, CREAM, DROPS, INHALER,
                  PATCH, POWDER, SUPPO, OTHER)
requires_prescription: bool (default False)
controlled_substance_schedule: Enum(NONE, SCHEDULE_I, SCHEDULE_II, SCHEDULE_III,
                                     SCHEDULE_IV, SCHEDULE_V) default NONE
active_ingredients: str | null           # comma-separated e.g., "Amoxicillin 500mg"
side_effects: str[]                      # free-text array e.g., ["Nausea", "Dizziness"]
drug_interactions: str | null            # free text description
local_license_number: str | null

# Picked from BranchSettings master lists (not free-typed):
storage_conditions: str[]                # subset of BranchSettings.storage_conditions
special_instructions: str[]              # subset of BranchSettings.special_instructions
dosage_instructions: str[]               # subset of BranchSettings.dosage_instructions

stock_location_id: UUID (FK → StockLocation) | null

is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

> `storage_conditions`, `special_instructions`, `dosage_instructions` on ProductGeneric are stored as `array of strings (BSON array)`. Frontend presents them as **multi-select dropdowns** populated from `BranchSettings` lists.

**CRUD search fields:** `name`, `active_ingredients`
**CRUD filter fields:** `dosage_form`, `requires_prescription`, `controlled_substance_schedule`, `stock_location_id`, `is_active`

---

#### 4f. Product (core — all product types)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
category_id: UUID (FK → ProductCategory)
brand_id: UUID (FK → ProductBrand) | null       # optional
generic_id: UUID (FK → ProductGeneric) | null   # optional; if set, it's a medicine/drug
name: str                                        # product display name
basic_sku_id: UUID (FK → ProductSKU)            # smallest sellable/dispensing unit
description: str | null
image_url: str | null
barcode: str | null (unique per branch)
requires_prescription: bool (default False)      # can override generic's value
is_taxable: bool (default False)
reorder_level: int (default 10)
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

> `generic_name`, `brand` (string), `sku` (string), `unit`, `pack_size`, `weight_volume`, `country_of_origin`, `manufacturer` are **removed** from Product — all derived from linked `ProductGeneric` and `ProductBrand`.

**CRUD search fields:** `name`, `barcode`
**CRUD filter fields:** `category_id`, `brand_id`, `generic_id`, `requires_prescription`, `is_taxable`, `is_active`

---

#### 4g. ProductSKUMapping (pack-size conversions)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
product_id: UUID (FK → Product)
sku_id: UUID (FK → ProductSKU)                 # the larger pack SKU (e.g., "Box")
mapped_sku_id: UUID (FK → ProductSKU)          # must match product.basic_sku_id (e.g., "Tablet")
mapped_sku_count: int                           # how many basic units in 1 of sku_id (e.g., 100)
basic_sku_count: int (default 1)               # always 1 for standard mappings
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

> **Example:** Product = Paracetamol 500mg. `basic_sku` = Tablet. Mapping: `sku_id` = Box, `mapped_sku_id` = Tablet, `mapped_sku_count` = 100. Meaning: 1 Box = 100 Tablets.
> Multiple mappings per product (Box, Strip, Carton) are all allowed.

**Product Endpoints:**
- `GET /products/categories/tree` — full nested tree
- `GET /products/categories/` — flat list
- `POST /products/categories/`
- `PATCH /products/categories/{id}`
- `DELETE /products/categories/{id}`
- `GET /products/skus/` — list
- `POST /products/skus/`
- `PATCH /products/skus/{id}`
- `DELETE /products/skus/{id}`
- `POST /products/skus/import/`
- `GET /products/brands/` — list
- `POST /products/brands/`
- `PATCH /products/brands/{id}`
- `DELETE /products/brands/{id}`
- `POST /products/brands/import/`
- `PATCH /products/brands/bulk-update/`
- `DELETE /products/brands/bulk-delete/`
- `GET /products/generics/` — list
- `POST /products/generics/`
- `PATCH /products/generics/{id}`
- `DELETE /products/generics/{id}`
- `POST /products/generics/import/`
- `PATCH /products/generics/bulk-update/`
- `DELETE /products/generics/bulk-delete/`
- `GET /products/stock-locations/`
- `POST /products/stock-locations/`
- `PATCH /products/stock-locations/{id}`
- `DELETE /products/stock-locations/{id}`
- `GET /products/` — list with filters
- `POST /products/`
- `GET /products/{id}` — includes brand, generic (with all medicine attrs), sku mappings
- `PATCH /products/{id}`
- `DELETE /products/{id}`
- `GET /products/search?q=` — search name/barcode
- `POST /products/import/`
- `PATCH /products/bulk-update/`
- `DELETE /products/bulk-delete/`
- `GET /products/{id}/sku-mappings/`
- `POST /products/{id}/sku-mappings/`
- `DELETE /products/{id}/sku-mappings/{mapping_id}`
- `GET /products/{id}/stock-summary`

---

### 5. 🏭 Supplier Module

#### Supplier
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
name: str
type: Enum(COMPANY, INDIVIDUAL)
tax_id: str | null
email: str | null
phone: str | null
address: str | null
city: str | null
country: str | null
payment_terms: str | null
credit_limit: Decimal(12,2) | null
outstanding_balance: Decimal(12,2) default 0
notes: str | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### SupplierContact (optional — same structure as ChannelContact)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
supplier_id: UUID (FK → Supplier)
name: str
designation: str | null
phone: str | null
email: str | null
is_primary: bool (default False)
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### DistributionChannel
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
supplier_id: UUID (FK → Supplier)
name: str
channel_type: Enum(AGENT, DISTRIBUTOR)
payment_terms: str | null
credit_limit: Decimal(12,2) | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### ChannelContact
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
channel_id: UUID (FK → DistributionChannel)
name: str
designation: str | null
phone: str | null
email: str | null
is_primary: bool (default False)
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### ChannelPromotion (reusable promotion tag)
A reusable, structured promotion that can be attached as a **default** on a channel-product mapping or applied per PO line (time-specific).
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
channel_id: UUID (FK → DistributionChannel)
name: str                          # display tag e.g. "5% Off", "10+1 Bonus", "20+3 Bonus"
promotion_type: Enum(PERCENTAGE_DISCOUNT, BONUS_QTY)   # bonus = buy X get Y free
discount_percent: Decimal(5,2) | null      # for PERCENTAGE_DISCOUNT
buy_qty: int | null                        # for BONUS_QTY (e.g. 10)
free_qty: int | null                       # for BONUS_QTY (e.g. 1)
is_default: bool (default False)           # default promos auto-apply on the mapping
valid_from: date | null                    # null = always (default); set = time-specific
valid_to: date | null
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### ChannelProductMapping (the channel's ordered product catalogue)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
channel_id: UUID (FK → DistributionChannel)
product_id: UUID (FK → Product)
sort_order: int (default 0)                # channel's ordering/sort sequence
channel_unit_cost: Decimal(12,4) | null    # channel-specific cost per purchase SKU
purchase_sku_id: UUID (FK → ProductSKU) | null   # channel-specific pack SKU
is_active: bool
created_by / updated_by / created_at / updated_at
```
> Unique on `(channel_id, product_id)`.

#### ChannelProductMappingPromotion (link — many default promotions per mapping)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
mapping_id: UUID (FK → ChannelProductMapping)
promotion_id: UUID (FK → ChannelPromotion)
```
> Multiple default promotions can tag a single mapped product.

#### ChannelRepVisit (sales rep visit log — separate from HR attendance)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
channel_id: UUID (FK → DistributionChannel)
visit_number: str (unique)                 # PHARMAOPS-BR01-VISIT-2024-00001
rep_name: str                              # may match a ChannelContact
channel_contact_id: UUID (FK → ChannelContact) | null
visit_date: datetime
recorded_by: UUID (FK → User)
notes: str | null
created_by / updated_by / created_at / updated_at
```
> This is the channel rep's **attendance/visit**, distinct from staff (HR) attendance. A visit can spawn a Purchase Order.

**Supplier Endpoints:** (all with standard import/bulk-update/bulk-delete variants)
- `GET /suppliers/` | `POST /suppliers/` | `GET /suppliers/{id}` | `PATCH /suppliers/{id}` | `DELETE /suppliers/{id}`
- `POST /suppliers/import/` | `PATCH /suppliers/bulk-update/` | `DELETE /suppliers/bulk-delete/`
- `POST /suppliers/{id}/contacts/` | `PATCH /suppliers/{id}/contacts/{contact_id}` | `DELETE /suppliers/{id}/contacts/{contact_id}`
- `GET /suppliers/{id}/channels/` | `POST /suppliers/{id}/channels/` | `PATCH /suppliers/{id}/channels/{id}`
- `POST /suppliers/{id}/channels/{id}/contacts/`
- `GET /suppliers/{id}/payment-history/` | `GET /suppliers/{id}/outstanding-invoices/`
- `GET /channels/{id}/promotions/` | `POST /channels/{id}/promotions/` | `PATCH /channels/{id}/promotions/{promo_id}` | `DELETE /channels/{id}/promotions/{promo_id}`
- `GET /channels/{id}/product-mappings/` | `POST /channels/{id}/product-mappings/` | `PATCH /channels/{id}/product-mappings/{id}` | `DELETE /channels/{id}/product-mappings/{id}`
- `POST /channels/{id}/product-mappings/import/` — bulk map products to a channel
- `GET /channels/{id}/visits/` | `POST /channels/{id}/visits/`

---

#### SupplierPayment (lives in Supplier Module)

Supports **combined payments** (one payment row → many purchase invoices) and **partial payments** (many payment rows → one invoice) via the allocation table. A payment may also apply one or more **Purchase Credit Notes** as offsetting credit.

```
id: UUID (PK)
branch_id: UUID (FK → Branch)
payment_number: str (auto)              # PHARMAOPS-BR01-SP-2024-00001
supplier_id: UUID (FK → Supplier)
payment_date: date
payment_method: Enum(CASH, BANK_TRANSFER, CHEQUE, MOBILE)
amount: Decimal(12,2)                   # net cash paid (after credit notes applied)
reference_number: str | null
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### SupplierPaymentAllocation
Each row allocates the payment to **either** a Purchase Invoice (debit settled) **or** a Purchase Credit Note (credit applied — this is the moment the credit note takes effect).
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
payment_id: UUID (FK → SupplierPayment)
purchase_invoice_id: UUID (FK → PurchaseInvoice) | null
purchase_credit_note_id: UUID (FK → PurchaseCreditNote) | null   # exactly one of the two set
allocated_amount: Decimal(12,2)         # positive for invoice settle; credit amount for credit note
```

#### PurchaseCreditNote (return to supplier — symmetric with Sale Credit Note)

> **Important lifecycle:** Creating a Purchase Credit Note only **records** the intended return — it does **NOT** immediately reduce inventory or supplier outstanding. The reduction happens **only when the credit note is applied/attached to a SupplierPayment** (via `SupplierPaymentAllocation`). At that point: inventory `quantity_remaining` is reduced for each item's batch, and the supplier `outstanding_balance` is reduced by the credit amount.

```
id: UUID (PK)
branch_id: UUID (FK → Branch)
credit_note_number: str (unique)        # PHARMAOPS-BR01-PCN-2024-00001
supplier_id: UUID (FK → Supplier)
channel_id: UUID (FK → DistributionChannel)
original_purchase_invoice_id: UUID (FK → PurchaseInvoice) | null
issue_date: date
reason: str
total_amount: Decimal(12,2)
status: Enum(DRAFT, ISSUED, APPLIED, CANCELLED)   # APPLIED once allocated to a payment
applied_payment_id: UUID (FK → SupplierPayment) | null
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### PurchaseCreditNoteItem
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
purchase_credit_note_id: UUID (FK → PurchaseCreditNote)
purchase_invoice_item_id: UUID (FK → PurchaseInvoiceItem) | null
product_id: UUID (FK → Product)
batch_id: UUID (FK → InventoryBatch)
quantity_returned: int
unit_cost: Decimal(12,4)                # per basic SKU unit
amount: Decimal(12,2)
stock_reduced: bool (default False)     # flips to True when credit note is APPLIED
```

> **Purchase Return Eligibility:** validate each item's `batch.expiry_date` against `ProductBrand.return_expiry_before`. If `today + return_expiry_before ≥ batch.expiry_date`, the item is within the returnable window. Items outside the window are flagged with a warning but can be overridden.

**Supplier Payment & Credit Note Endpoints:**
- `GET /suppliers/payments/` | `POST /suppliers/payments/` (creates payment + allocations in one request, applies any allocated credit notes) | `GET /suppliers/payments/{id}`
- `GET /suppliers/credit-notes/` | `POST /suppliers/credit-notes/` | `GET /suppliers/credit-notes/{id}` | `PATCH /suppliers/credit-notes/{id}` | `POST /suppliers/credit-notes/{id}/cancel`
- `POST /suppliers/credit-notes/bulk-delete/`

---

### 6. 📦 Inventory Module

#### InventoryBatch
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
product_id: UUID (FK → Product)
channel_id: UUID (FK → DistributionChannel)
purchase_invoice_id: UUID (FK → PurchaseInvoice) | null
batch_number: str
manufacture_date: date | null
expiry_date: date | null
quantity_received: int              # formatted: ###,###
quantity_remaining: int             # formatted: ###,###
cost_price: Decimal(12,4)           # per basic_sku unit; formatted: ###,###.##
selling_price: Decimal(12,4)        # per basic_sku unit; formatted: ###,###.##
location_id: UUID (FK → StockLocation) | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### StockMovement (Stock In / Stock Out — both without an invoice)

Surfaced in the UI as two actions: **Stock In** (add existing stock not tied to a purchase invoice — e.g. opening balances, found stock) and **Stock Out** (remove expired or damaged items, stocktake corrections).

```
id: UUID (PK)
branch_id: UUID (FK → Branch)
movement_type: Enum(STOCK_IN, STOCK_OUT)
product_id: UUID (FK → Product)
batch_id: UUID (FK → InventoryBatch) | null
  # STOCK_IN: null when creating a NEW batch (use fields below); set when topping up an existing batch
  # STOCK_OUT: always set — the batch being reduced
quantity: int                       # always in basic SKU units

# Used only for STOCK_IN that creates a new batch:
batch_number: str | null
manufacture_date: date | null
expiry_date: date | null
cost_price: Decimal(12,4) | null    # per basic SKU unit
selling_price: Decimal(12,4) | null # per basic SKU unit
location_id: UUID (FK → StockLocation) | null

# Used only for STOCK_OUT:
reason: Enum(EXPIRED, DAMAGED, STOCKTAKE_CORRECTION, LOST, OTHER) | null

notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

> **Price rule:** `cost_price` and `selling_price` are **always stored per basic SKU unit**, never per pack. Any pack-level entry is converted to basic units before storing (`qty_basic = pack_qty × mapping.mapped_sku_count`), and price is divided to per-basic-unit accordingly.

#### StockTransfer
```
id: UUID (PK)
from_branch_id: UUID (FK → Branch)
to_branch_id: UUID (FK → Branch)
transfer_number: str (unique)       # CHAIN-TRF-BR01-2024-00001
status: Enum(PENDING, IN_TRANSIT, PARTIALLY_RECEIVED, RECEIVED, CANCELLED)
requested_by: UUID (FK → User)
approved_by: UUID (FK → User) | null
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### StockTransferItem
```
id: UUID (PK)
transfer_id: UUID (FK → StockTransfer)
batch_id: UUID (FK → InventoryBatch)
product_id: UUID (FK → Product)
quantity_requested: int
quantity_received: int (default 0)
notes: str | null
```

**Inventory Endpoints:**
- `GET /inventory/` | `GET /inventory/batches/` | `POST /inventory/batches/` | `PATCH /inventory/batches/{id}`
- `GET /inventory/low-stock/` | `GET /inventory/expiring-soon/?days=30` | `GET /inventory/expired/`
- `POST /inventory/stock-in/` — add stock (new batch or top up existing), no invoice
- `POST /inventory/stock-out/` — remove expired/damaged/lost stock from a batch
- `GET /inventory/movements/` — list all stock movements (filter by type, product, reason, date)
- `POST /inventory/transfers/` | `GET /inventory/transfers/` | `GET /inventory/transfers/{id}`
- `POST /inventory/transfers/{id}/receive` | `POST /inventory/transfers/{id}/cancel`

---

### 7. 🧾 Purchase Invoice Module (incl. Purchase Orders)

#### PurchaseOrder (created from a channel rep visit; convertible to a PurchaseInvoice)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
order_number: str (unique per branch)      # PHARMAOPS-BR01-PO-2024-00001
channel_id: UUID (FK → DistributionChannel)
supplier_id: UUID (FK → Supplier)          # denormalized via channel
rep_visit_id: UUID (FK → ChannelRepVisit) | null   # the visit that created it
status: Enum(DRAFT, PLACED, PARTIALLY_CONVERTED, CONVERTED, CANCELLED)
order_date: date
expected_delivery_date: date | null
subtotal: Decimal(12,2)
notes: str | null
created_by / updated_by / created_at / updated_at
```
> A PO can be **partially converted** — multiple PurchaseInvoices may be generated from one PO (status moves PLACED → PARTIALLY_CONVERTED → CONVERTED).

#### PurchaseOrderItem
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
purchase_order_id: UUID (FK → PurchaseOrder)
product_id: UUID (FK → Product)
purchase_sku_id: UUID (FK → ProductSKU)
order_qty: int                              # in purchase SKU units
free_qty: int (default 0)
unit_cost: Decimal(12,4)
qty_converted: int (default 0)              # how much has been pulled into invoices
notes: str | null
created_by / updated_by / created_at / updated_at
```

#### PurchaseOrderItemPromotion (link — promotions applied to a PO line)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
purchase_order_item_id: UUID (FK → PurchaseOrderItem)
promotion_id: UUID (FK → ChannelPromotion)
# snapshot so historical promo terms survive even if the promotion is later edited:
promotion_type: Enum(PERCENTAGE_DISCOUNT, BONUS_QTY)
discount_percent: Decimal(5,2) | null
buy_qty: int | null
free_qty: int | null
valid_from: date | null
valid_to: date | null
```
> Default promotions auto-apply from the channel-product mapping; the buyer can override per line and add **time-specific** promotions on the ordering screen. Multiple promotions may apply to one line. Terms are snapshotted onto the PO line.

**Purchase Order Endpoints:**
- `GET /purchase-orders/` | `POST /purchase-orders/` | `GET /purchase-orders/{id}` | `PATCH /purchase-orders/{id}`
- `POST /purchase-orders/{id}/place` | `POST /purchase-orders/{id}/cancel`
- `POST /purchase-orders/{id}/convert` — create a PurchaseInvoice from remaining (unconverted) lines; supports partial conversion; carries qty, free qty, and promotion snapshots
- `POST /purchase-orders/bulk-delete/`

---

#### PurchaseInvoice
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
invoice_number: str (unique per branch)   # PHARMAOPS-BR01-PI-2024-00001
channel_id: UUID (FK → DistributionChannel)
supplier_id: UUID (FK → Supplier)         # denormalized
purchase_order_id: UUID (FK → PurchaseOrder) | null   # set when converted from a PO
supplier_invoice_number: str | null
status: Enum(DRAFT, CONFIRMED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED)
invoice_date: date
expected_delivery_date: date | null
received_date: date | null
subtotal: Decimal(12,2)
discount_amount: Decimal(12,2) default 0
total_amount: Decimal(12,2)
payment_status: Enum(UNPAID, PARTIAL, PAID)
amount_paid: Decimal(12,2) default 0
outstanding_amount: Decimal(12,2)
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### PurchaseInvoiceItem
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
purchase_invoice_id: UUID (FK → PurchaseInvoice)
product_id: UUID (FK → Product)
purchase_sku_id: UUID (FK → ProductSKU)   # the SKU purchased in (e.g. Box); converted to basic
quantity_ordered: int                      # in purchase_sku units
quantity_received: int (default 0)         # in purchase_sku units
free_qty: int (default 0)                  # bonus units received free (purchase_sku units)
unit_cost: Decimal(12,4)                   # per purchase_sku unit
discount_type: Enum(PERCENTAGE, FIXED) default PERCENTAGE
discount_value: Decimal(12,4) default 0    # the % or fixed figure user entered
discount_amount: Decimal(12,2)             # AUTO: PERCENTAGE → gross × value/100; FIXED → value
batch_number: str | null
expiry_date: date | null
gross_amount: Decimal(12,2)                # unit_cost × quantity_received
subtotal: Decimal(12,2)                    # gross_amount − discount_amount
effective_basic_cost: Decimal(12,4)        # AUTO, stored to batch.cost_price (see formula)
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**Basic-SKU cost calculation (purchase):**
```
basic_units_total = (quantity_received + free_qty) × sku_to_basic_factor(purchase_sku_id, product)
effective_basic_cost = subtotal / basic_units_total
```
> Free quantity and discount both lower the effective per-basic-unit cost. This `effective_basic_cost` becomes the `cost_price` on the inventory batch created at receive time. All inventory prices remain **per basic SKU unit**.
- Full CRUD + `POST /purchase-invoices/{id}/receive` + `POST /purchase-invoices/{id}/cancel`
- `POST /purchase-invoices/bulk-delete/` | `PATCH /purchase-invoices/bulk-update/`

---

#### 🖥️ Purchase Terminal (GRN) — fast full-screen goods receiving

A dedicated **full-screen**, **keyboard-driven** terminal for receiving goods, sharing the same shell pattern and shortcut scheme as the Sale Terminal. Launched from a pinned **quick-access button in the Purchase module**; route `(/purchase-invoices/terminal)` with in-app fullscreen toggle and "Exit to dashboard".

> **No new model.** The terminal is a fast UI that drives the **existing PurchaseInvoice receive flow** (`POST /purchase-invoices/{id}/receive`) — it does not introduce a separate GoodsReceivedNote table. "GRN" here is the receiving experience and its printable output.

**Flow** — supports **both**: receive against an **existing Purchase Invoice**, or **create a new PI on the fly** as goods are received.
- **Top:** select Distribution Channel + Supplier (derived); or pick an existing open/partial PI to receive against.
- **Lines:** **barcode-scan** each item; per line enter **batch number, expiry, qty, unit cost, free qty, discount** with **live auto-calc** of `discount_amount` and `effective_basic_cost` (per basic SKU).
- **Running totals:** total qty and total value update as you scan.
- **Partial receiving:** receive some now, leave the rest — PI status moves to `PARTIALLY_RECEIVED`; remainder receivable later.
- **Save as draft** and resume later.

**Keyboard shortcuts:** `F2` scan/search · `F3` qty · `F4` cost · `F5` batch/expiry · `F6` free qty · `F7` discount · `F8` save draft · `Enter` add line / finalize · `Esc` cancel.

**On finalize:**
1. Creates/updates `PurchaseInvoiceItem` rows and **creates `InventoryBatch` records** with the computed `effective_basic_cost`.
2. Updates PI `status` (`RECEIVED` or `PARTIALLY_RECEIVED`).
3. **Posts the journal entry** (debit Inventory / Accounts Payable, credit Cash/Bank when paid) per the Account-module auto-posting rules.
4. **Generates a printable GRN document** (see Print module).

**Terminal Endpoints**
- `GET /purchase-invoices/terminal/bootstrap` — channels/suppliers, open/partial PIs, recent products
- `POST /purchase-invoices/terminal/draft` | `GET /purchase-invoices/terminal/drafts` | `POST /purchase-invoices/{id}/resume`
- `GET /purchase-invoices/product-lookup?q=` — barcode/name/SKU lookup
- (finalize reuses `POST /purchase-invoices/` and `POST /purchase-invoices/{id}/receive`)

---

#### 🖥️ Order Terminal (Channel Rep Visit → Purchase Order) — full-screen ordering

Launched from a **quick-access button in the Purchase module** (like the GRN terminal); route `(/purchase-orders/terminal)` using the shared `TerminalShell` (full-screen, fullscreen toggle, exit, shared shortcuts, resume-on-navigation).

**Open flow:** pick a Distribution Channel → **mark the rep's visit** (`ChannelRepVisit`: rep name/contact, date) → the screen loads all of that channel's **mapped products** (`ChannelProductMapping`, in `sort_order`).

**Per mapped product row shows:**
- **Existing qty** = sum of `InventoryBatch.quantity_remaining` for the product (this branch)
- **Last month sold qty** and **last 3 months sold qty** — from `SaleInvoiceItem` history (by product, by branch)
- **Reorder indicator** (uses `Product.reorder_level`):
  - 🔴 **below** — existing ≤ reorder_level
  - 🟡 **near** — reorder_level < existing < 1.5 × reorder_level
  - 🟢 **safe** — existing ≥ 1.5 × reorder_level
- **Promotion tags** — channel mapping defaults auto-applied (overridable); buyer can add **time-specific** promos (e.g. "5% this month", "10+1 from→to", "20+3") that attach to the PO line
- **Order qty** + **free qty** inputs per line

**Competitor pricing comparison (per product):** pulls the **last PurchaseInvoiceItem** for that product from up to **5 channels including the selected one** — each showing price + date + supplier/channel, displayed side-by-side, with **cheapest/most-expensive highlighted**. (Competitors = other distribution channels that have supplied the same product.)

**Side panels:**
- **Last 5 purchase invoices** from the selected channel (header + clickable to detail)
- **Returns** (`PurchaseCreditNote` items) **matching this channel's mapped products** (clickable to detail)

**Finalize:** creates a `PurchaseOrder` (DRAFT → PLACED) with `PurchaseOrderItem` rows + promotion snapshots, linked to the rep visit. The PO is later **converted to a PurchaseInvoice** (fully or partially) when goods are received via the GRN terminal.

**Order Terminal Endpoints**
- `GET /purchase-orders/terminal/bootstrap?channel_id=` — mapped products with existing qty, last-month & last-3-month sold qty, reorder indicator, default promotions
- `GET /purchase-orders/terminal/competitor-pricing?product_id=&channel_id=` — last PI line across up to 5 channels (incl. selected), cheapest/most-expensive flags
- `GET /purchase-orders/terminal/channel-recent?channel_id=` — last 5 purchase invoices + matching return (credit note) items for mapped products
- `POST /channels/{id}/visits/` — mark rep visit (reused)
- (finalize reuses `POST /purchase-orders/`; conversion reuses `POST /purchase-orders/{id}/convert`)

---

### 8. 👨‍⚕️ Prescription Module

#### Doctor
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
title: str | null
first_name: str
last_name: str
specialization: str | null
license_number: str (unique per branch)
clinic_hospital: str | null
phone: str | null
email: str | null
is_verified: bool (default False)
verification_notes: str | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `first_name`, `last_name`, `license_number`
**CRUD filter fields:** `specialization`, `is_verified`, `is_active`

#### Patient
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
title: Enum(MR, MRS, MS, MASTER, MISS, DR, OTHER)
first_name: str
last_name: str
date_of_birth: date | null
gender: Enum(MALE, FEMALE, OTHER) | null
nic_number: str | null (unique per branch)
phone: str
email: str | null
blood_group: str | null
allergies: str | null
chronic_conditions: str | null
notes: str | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `first_name`, `last_name`, `nic_number`, `phone`
**CRUD filter fields:** `gender`, `blood_group`, `is_active`

#### Prescription
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
prescription_number: str (unique per branch)
patient_id: UUID (FK → Patient)
doctor_id: UUID (FK → Doctor)
issue_date: date
valid_until: date | null
days_needed: int | null              # overall course duration (prescription level)
expected_next_visit_date: date | null   # AUTO = issue_date + days_needed (refill due date)
actual_next_visit_date: date | null      # filled when patient returns (for adherence analysis)
status: Enum(PENDING, DISPENSED, PARTIAL, EXPIRED, CANCELLED)
scan_url: str | null
verified_by: UUID (FK → User) | null
verified_at: datetime | null
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### PrescriptionItem
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
prescription_id: UUID (FK → Prescription)
prescribed_text: str | null          # raw free-text drug name from the script
product_id: UUID (FK → Product) | null       # exact product when identifiable
generic_id: UUID (FK → ProductGeneric) | null # fallback when no exact product
quantity_prescribed: int
quantity_dispensed: int (default 0)
dosage_instructions: str             # free text per item
days_needed: int | null              # per-drug duration (item level)
duration: str | null
```
> Capture strategy: try to identify an exact **Product**; if not, map to a **ProductGeneric**; always keep the raw `prescribed_text`. `days_needed` exists at **both** prescription level (course) and item level (per drug).

#### PrescribedItemMapping (learned mapping — improves suggestions over time)
A reusable lookup that learns which Product was issued for a given prescribed text / generic, captured at multiple scopes so suggestions get smarter.
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
scope: Enum(GLOBAL, PATIENT, DOCTOR)
patient_id: UUID (FK → Patient) | null       # set when scope = PATIENT
doctor_id: UUID (FK → Doctor) | null         # set when scope = DOCTOR
prescribed_text: str | null
generic_id: UUID (FK → ProductGeneric) | null
product_id: UUID (FK → Product)              # the product chosen
use_count: int (default 1)                   # frequency — drives "most-used" global suggestion
last_used_at: datetime
created_by / updated_by / created_at / updated_at
```
> Updated every time a prescription item is dispensed: increments `use_count` and refreshes `last_used_at` for the matching GLOBAL, PATIENT, and DOCTOR rows.

---

#### 🖥️ Prescription Dispensing Terminal (Prescription → Sale Invoice / Sale Order)

A dedicated **full-screen** dispensing screen (also reachable from the prescription detail page) that converts a verified prescription into a **SaleInvoice or SaleOrder**. Reuses the shared `TerminalShell` + keyboard shortcuts.

**Per prescription item, auto-populate up to four issuing suggestions side-by-side** (the dispenser picks one or overrides manually):
1. **Exact product** as prescribed (`PrescriptionItem.product_id`).
2. **Last-issued product** for this patient + generic (from `PrescribedItemMapping` scope=PATIENT, or the patient's last invoice).
3. **Lowest-price product** matching the generic (current selling price across in-stock batches).
4. **Most-profitable product** matching the generic (highest margin = selling − cost, in stock).

**Mapping fallback:** if an item has no exact product, suggestions are computed from its `generic_id`; the dispenser's final choice is **persisted to `PrescribedItemMapping`** (GLOBAL + PATIENT + DOCTOR scopes) for future use.

**Behavior:**
- Choose target: **Sale Invoice** (dispense now) or **Sale Order** (quotation/pre-order).
- **Partial dispensing** allowed — issue some items now, rest later; `quantity_dispensed` per item; `quantity_issued` may differ from `quantity_prescribed`.
- Prescription `status` moves PENDING → PARTIAL → DISPENSED accordingly.
- On dispense, set `expected_next_visit_date` (issue_date + days_needed) and update the learned mapping.
- **Print drug-cover labels** (one per dispensed item; batch-print all) — see Print module.

**Dispensing Endpoints:**
- `GET /prescriptions/{id}/dispense/suggestions` — per item, the four ranked product suggestions with price/margin/stock
- `POST /prescriptions/{id}/dispense` — body: per-item chosen product + qty + target (`SALE_INVOICE` | `SALE_ORDER`); creates the sale, links prescription(s), updates `quantity_dispensed`, persists mappings, returns label data
- `GET /prescriptions/{id}/labels` — drug-cover label payload for printing
- `PATCH /prescriptions/{id}/record-return` — set `actual_next_visit_date` when the patient returns (adherence)

**Prescription Endpoints:** Full CRUD on Doctors, Patients, Prescriptions; all with import/bulk-update/bulk-delete.

---

### 9. 👥 Customer Module

#### Customer
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
title: Enum(MR, MRS, MS, MASTER, MISS, DR, OTHER)
first_name: str
last_name: str
date_of_birth: date | null
gender: Enum(MALE, FEMALE, OTHER) | null
nic_number: str | null (unique per branch)
phone: str
email: str | null
address: str | null
loyalty_points: int (default 0)
credit_balance: Decimal(12,2) default 0
notes: str | null
is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `first_name`, `last_name`, `nic_number`, `phone`
**CRUD filter fields:** `gender`, `is_active`, `credit_balance > 0`

#### CustomerPatient (many-to-many link)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
customer_id: UUID (FK → Customer)
patient_id: UUID (FK → Patient)
relationship: str | null          # "Self", "Child", "Spouse", "Parent"
is_primary: bool (default False)
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

---

#### CustomerPayment (lives in Customer Module — replaces the old SalePayment)

Handles both **split payments** (one sale invoice settled by multiple methods → multiple payment rows allocated to the same invoice) and **combined payments** (one payment row allocated across multiple sale invoices, e.g. a customer clearing several credit invoices at once).

```
id: UUID (PK)
branch_id: UUID (FK → Branch)
payment_number: str (auto)              # PHARMAOPS-BR01-CP-2024-00001
customer_id: UUID (FK → Customer) | null   # null allowed for walk-in immediate sale
payment_date: datetime
payment_method: Enum(CASH, CARD, MOBILE, BANK_TRANSFER, CREDIT, LOYALTY_POINTS, STORE_CREDIT)
amount: Decimal(12,2)
reference_number: str | null            # card auth code, transfer ref, cheque no.
loyalty_points_used: int default 0      # when method = LOYALTY_POINTS
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### CustomerPaymentAllocation
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
payment_id: UUID (FK → CustomerPayment)
sale_invoice_id: UUID (FK → SaleInvoice)
allocated_amount: Decimal(12,2)
```

> **At POS:** a sale paid by cash + card creates one SaleInvoice and **two** CustomerPayment rows (CASH, CARD), each with one allocation to that invoice (split).
> **Later credit settlement:** a customer paying off three older invoices creates **one** CustomerPayment row with **three** allocations (combined). When `payment_method = CREDIT` at sale time, no immediate payment is recorded and `customer.credit_balance` increases.

**Customer Endpoints:**
- `GET /customers/` | `POST /customers/` | `GET /customers/{id}` | `PATCH /customers/{id}` | `DELETE /customers/{id}`
- `POST /customers/import/` | `PATCH /customers/bulk-update/` | `DELETE /customers/bulk-delete/`
- `POST /customers/{id}/link-patient/` | `GET /customers/{id}/sale-history/` | `GET /customers/{id}/credit-notes/`
- `GET /customers/payments/` | `POST /customers/payments/` (payment + allocations in one request) | `GET /customers/payments/{id}`
- `GET /customers/{id}/outstanding-invoices/` — unpaid/partial sale invoices for allocation

---

### 10. 🧾 Sale Invoice Module (incl. Sale Orders)

#### SaleOrder (Quotation / Pre-order / Standing order; convertible to a SaleInvoice)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
order_number: str (unique per branch)      # PHARMAOPS-BR01-SO-2024-00001
order_type: Enum(QUOTATION, PRE_ORDER, STANDING_ORDER)
customer_id: UUID (FK → Customer) | null
status: Enum(DRAFT, CONFIRMED, PARTIALLY_INVOICED, INVOICED, CANCELLED)
order_date: date
valid_until: date | null                    # quotation validity / expiry
expected_delivery_date: date | null
subtotal: Decimal(12,2)
discount_amount: Decimal(12,2) default 0
total_amount: Decimal(12,2)
is_reserved: bool (default False)           # true while a confirmed order holds reserved qty
notes: str | null
created_by / updated_by / created_at / updated_at
```
> No stock is deducted until conversion. On **CONFIRMED**, the order may **soft-reserve at product level** (see SaleOrderReservation). A QUOTATION past `valid_until` is treated as expired (Celery flags it; reservations released).

#### SaleOrderItem
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
sale_order_id: UUID (FK → SaleOrder)
product_id: UUID (FK → Product)
order_qty: int                              # basic SKU units
free_qty: int (default 0)
quoted_price: Decimal(12,4)                 # editable; may differ from current selling price
discount_type: Enum(PERCENTAGE, FIXED) default PERCENTAGE
discount_value: Decimal(12,4) default 0
discount_amount: Decimal(12,2)              # auto
subtotal: Decimal(12,2)                     # (quoted_price × order_qty) − discount_amount
qty_invoiced: int (default 0)               # how much has been pulled into invoices
created_by / updated_by / created_at / updated_at
```

#### SaleOrderPrescription (link — multiple prescriptions per order, like a sale)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
sale_order_id: UUID (FK → SaleOrder)
prescription_id: UUID (FK → Prescription)
created_by / created_at
```

#### SaleOrderReservation (product-level soft reservation)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
sale_order_id: UUID (FK → SaleOrder)
product_id: UUID (FK → Product)
reserved_qty: int                           # basic SKU units, product-level (no specific batch)
released: bool (default False)              # set true on convert / cancel / expiry
created_by / updated_by / created_at / updated_at
```
> **Soft reservation:** reduces *available-to-sell* display (`available = on_hand − active_reservations`) but does **not** block other sales or pin a batch. Released automatically on conversion, cancellation, or quotation expiry.

**Sale Order Endpoints:**
- `GET /sale-orders/` | `POST /sale-orders/` | `GET /sale-orders/{id}` | `PATCH /sale-orders/{id}`
- `POST /sale-orders/{id}/confirm` (optionally creates reservations) | `POST /sale-orders/{id}/cancel` (releases reservations)
- `POST /sale-orders/{id}/convert` — create a SaleInvoice from remaining (un-invoiced) lines; full or partial; carries qty, free qty, quoted price, discounts, prescription links; releases matching reservations; updates `qty_invoiced` and status (CONFIRMED → PARTIALLY_INVOICED → INVOICED)
- `POST /sale-orders/{id}/print/` — printable quotation / order document
- `POST /sale-orders/bulk-delete/`

---

#### SaleInvoice
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
invoice_number: str              # PHARMAOPS-BR01-SI-2024-00001
customer_id: UUID (FK → Customer) | null    # null = walk-in
sale_order_id: UUID (FK → SaleOrder) | null   # set when converted from a sale order
sold_by: UUID (FK → User)
cash_session_id: UUID (FK → CashRegistrySession) | null   # the open session at sale time
sale_date: datetime
subtotal: Decimal(12,2)
discount_amount: Decimal(12,2) default 0
total_amount: Decimal(12,2)
amount_paid: Decimal(12,2)
change_given: Decimal(12,2) default 0
status: Enum(COMPLETED, PARTIALLY_REFUNDED, FULLY_REFUNDED)
is_parked: bool (default False)   # held/suspended cart, resumable in the terminal
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```
> The single `prescription_id` is replaced by a link table — **one invoice can attach multiple prescriptions.**

#### SaleInvoicePrescription (link — many prescriptions per invoice)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
sale_invoice_id: UUID (FK → SaleInvoice)
prescription_id: UUID (FK → Prescription)
created_by: UUID (FK → User)
created_at: datetime
```

#### SaleInvoiceItem
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
sale_invoice_id: UUID (FK → SaleInvoice)
product_id: UUID (FK → Product)
batch_id: UUID (FK → InventoryBatch)       # FIFO: oldest non-expired
quantity: int                              # in basic SKU units
free_qty: int (default 0)                  # complimentary units (not charged)
unit_price: Decimal(12,4)                  # per basic SKU unit, from batch.selling_price
discount_type: Enum(PERCENTAGE, FIXED) default PERCENTAGE
discount_value: Decimal(12,4) default 0    # the % or fixed figure user entered
discount_amount: Decimal(12,2)             # AUTO: PERCENTAGE → (unit_price×quantity)×value/100; FIXED → value
subtotal: Decimal(12,2)                    # (unit_price × quantity) − discount_amount
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```
> `free_qty` deducts from inventory (FIFO) but contributes 0 to `subtotal`.

> **Payments are recorded via `CustomerPayment` (Customer Module), not on the invoice.** The POS `POST /sale-invoices/` request creates the invoice, its items, and the associated CustomerPayment row(s) + allocations in a single transaction.

#### SaleCreditNote (return / refund — symmetric with Purchase Credit Note)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
credit_note_number: str           # PHARMAOPS-BR01-SCN-2024-00001
original_sale_invoice_id: UUID (FK → SaleInvoice)
issued_by: UUID (FK → User)
issue_date: datetime
reason: str
refund_method: Enum(ORIGINAL_PAYMENT_METHOD, STORE_CREDIT, CASH)
total_refund_amount: Decimal(12,2)
status: Enum(ISSUED, APPLIED, CANCELLED)
is_exchange: bool (default False)
exchange_sale_invoice_id: UUID (FK → SaleInvoice) | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### SaleCreditNoteItem
```
id: UUID (PK)
credit_note_id: UUID (FK → SaleCreditNote)
sale_invoice_item_id: UUID (FK → SaleInvoiceItem)
product_id: UUID (FK → Product)
batch_id: UUID (FK → InventoryBatch)
quantity_returned: int
unit_price: Decimal(12,4)
refund_amount: Decimal(12,2)
stock_returned: bool (default True)        # restores batch.quantity_remaining on creation
```

**Sale Invoice & Sale Credit Note Endpoints:**
- `GET /sale-invoices/` | `POST /sale-invoices/` (creates invoice + items + CustomerPayment rows + allocations + prescription links, FIFO batch selection, in one transaction) | `GET /sale-invoices/{id}`
- `GET /sale-invoices/today-summary/` — dashboard KPIs
- `POST /sale-invoices/{id}/print/` — print-ready payload
- `GET /sale-credit-notes/` | `POST /sale-credit-notes/` (partial/full return or exchange; restores stock) | `GET /sale-credit-notes/{id}` | `POST /sale-credit-notes/{id}/cancel`
- `POST /sale-credit-notes/bulk-delete/`

---

#### 🖥️ Sale Terminal (POS) — fast full-screen checkout

A dedicated, distraction-free **full-screen** terminal optimized for speed, **keyboard-driven** (works without a mouse). Launched from a pinned **quick-access button in the Sale module**; route `(/sale-invoices/terminal)` renders its own minimal shell (no sidebar), with an **in-app fullscreen toggle** (Fullscreen API) and an **"Exit to dashboard"** button.

**Layout**
- **Top bar:** active branch, cashier, live **cash session total**, fullscreen toggle, exit.
- **Left/main:** scan/search box (always focused) + the cart line items (qty, unit price, discount, line total).
- **Right rail:** customer (walk-in default; phone lookup to attach), attached prescriptions (supports **multiple**), running totals, and quick-pay buttons.
- **Bottom:** product grid by **category / favorites** for quick tap; on-screen numeric keypad for qty/discount.

**Keyboard shortcuts** (shared scheme with the Purchase Terminal):
- `F2` focus search/scan · `F3` change qty of selected line · `F4` line discount · `F6` attach customer · `F7` attach prescription · `F8` park sale · `F9` resume parked · `Enter` proceed to payment · `F10` exact-cash · `F11` card · `F12` split payment · `Esc` cancel/clear.

**Behavior**
- **Cash session:** if the cashier has no OPEN `CashRegistrySession`, prompt to **auto-open** one (opening float); **block checkout while no session is open**. Live session total shown on the top bar.
- **Parked sales:** `is_parked = true` suspends the current cart (saved as a draft SaleInvoice) and clears the screen; resume later from the parked list.
- **Prescriptions:** quick-pick from pending prescriptions; **multiple** can be attached (via `SaleInvoicePrescription`); controlled/Rx items still enforce a verified prescription.
- **Checkout:** quick-pay buttons (exact cash / card / split); on completion, **immediately preview/print the receipt**, then **auto-clear for the next customer** while keeping the terminal open.
- **Resume on accidental navigation:** terminal cart state persists (server-side draft) so a reload/navigation returns the cashier to the in-progress cart.

**Terminal Endpoints**
- `GET /sale-invoices/terminal/bootstrap` — branch favorites, categories, open session, parked sales, pending prescriptions for the cashier
- `POST /sale-invoices/park` | `GET /sale-invoices/parked` | `POST /sale-invoices/{id}/resume`
- `GET /sale-invoices/product-lookup?q=` — fast barcode/name/SKU lookup with current batch price
- `POST /sale-invoices/quick-customer-lookup` — by phone
- (checkout reuses `POST /sale-invoices/`; session open reuses `POST /accounts/cash-registries/{id}/open`)

---

#### 🖥️ Sale Order Terminal (Quotation / Pre-order) — full-screen ordering

A dedicated full-screen ordering screen for creating **quotations, pre-orders, and standing orders**, launched from a **quick-access button in the Sale module** (route `/sale-orders/terminal`). Reuses the shared `TerminalShell`, fullscreen toggle, exit, the shared F-key shortcut scheme, and resume-on-navigation drafts — mirroring the purchase-side Order Terminal.

**Features:**
- **Order type** selector at top: QUOTATION / PRE_ORDER / STANDING_ORDER.
- **Customer attach** (phone lookup) + **multiple prescriptions** (like the Sale Terminal, via `SaleOrderPrescription`).
- **Mapped/favorite products grid + search** for fast line entry.
- Per line: **order qty + free qty + discount**, and an **editable quoted price** (defaults to current selling price, overridable).
- **Validity date** (quotation expiry) and **expected delivery date** fields.
- Live totals; on-screen keypad.
- On **Confirm**, optionally create product-level **soft reservations** (`SaleOrderReservation`).
- **Print** a quotation/order document (PDF).
- Later **convert** (full/partial) to a SaleInvoice — the converted invoice references `sale_order_id`.

**Sale Order Terminal Endpoints**
- `GET /sale-orders/terminal/bootstrap` — favorites, categories, customer-side defaults, available-to-sell qty (on-hand − active reservations)
- `GET /sale-orders/product-lookup?q=` — barcode/name/SKU lookup with current selling price
- `POST /sale-orders/quick-customer-lookup` — by phone
- (create reuses `POST /sale-orders/`; confirm/convert reuse the Sale Order endpoints above)

---

### 11. 👔 HR Module (Staff, Attendance, Payroll)

The HR module manages branch staff, daily clock-in/out attendance, and a monthly payroll run that auto-computes payslips from attendance.

#### StaffMember
A staff record is **separate from `User`** (login) and may optionally link to one. Staff without a system login (e.g. cleaners, helpers) simply have `user_id = null`.
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
user_id: UUID (FK → User) | null          # optional link to a login account
employee_code: str (unique per branch)    # auto-generated e.g. BR01-EMP-0001

# Personal
title: Enum(MR, MRS, MS, MASTER, MISS, DR, OTHER)
first_name: str
last_name: str
nic_number: str (unique per branch)
date_of_birth: date | null
gender: Enum(MALE, FEMALE, OTHER) | null
photo_url: str | null
address: str | null
phone: str                                 # ### ### ####
email: str | null
emergency_contact_name: str | null
emergency_contact_phone: str | null        # ### ### ####

# Employment
job_title: str
department: str | null
join_date: date
employment_type: Enum(FULL_TIME, PART_TIME, CONTRACT, INTERN)
employment_tenure: Enum(PERMANENT, TEMPORARY)
pay_type: Enum(MONTHLY, HOURLY)
end_date: date | null                       # for contract/temporary
status: Enum(ACTIVE, ON_NOTICE, RESIGNED, TERMINATED)

# Compensation
basic_salary: Decimal(12,2) | null          # for MONTHLY pay_type
hourly_rate: Decimal(12,4) | null           # for HOURLY pay_type
ot_rate_multiplier: Decimal(5,2) | null     # override branch default (e.g. 1.5)

# Bank (for payroll)
bank_name: str | null
bank_branch: str | null
bank_account_number: str | null
bank_account_name: str | null

is_active: bool
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

**CRUD search fields:** `first_name`, `last_name`, `employee_code`, `nic_number`
**CRUD filter fields:** `department`, `employment_type`, `pay_type`, `status`, `is_active`

#### StaffQualification (one staff → many)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
staff_id: UUID (FK → StaffMember)
qualification: str               # e.g., "Diploma in Pharmacy"
institution: str | null
year_completed: int | null
notes: str | null
created_by / updated_by / created_at / updated_at
```

#### StaffDocument (contracts, certificates, ID scans)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
staff_id: UUID (FK → StaffMember)
document_type: Enum(CONTRACT, NIC, CERTIFICATE, CV, OTHER)
title: str
file_url: str
expiry_date: date | null         # e.g. for contracts/visas
notes: str | null
created_by / updated_by / created_at / updated_at
```

#### StaffAllowance (recurring, per staff)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
staff_id: UUID (FK → StaffMember)
name: str                        # "Transport", "Meal", "Housing"
amount: Decimal(12,2)
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### StaffDeduction (recurring, per staff — e.g. loan/advance repayment)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
staff_id: UUID (FK → StaffMember)
name: str                        # "Staff Loan", "Salary Advance"
amount: Decimal(12,2)            # per-month recurring amount
is_active: bool
created_by / updated_by / created_at / updated_at
```

---

#### StaffAttendance (daily clock in/out)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
staff_id: UUID (FK → StaffMember)
attendance_date: date
clock_in: datetime | null                  # actual timestamp
clock_out: datetime | null
status: Enum(PRESENT, ABSENT, HALF_DAY, LATE, HOLIDAY) default PRESENT
hours_worked: Decimal(6,2) default 0        # AUTO from clock_in/out
overtime_hours: Decimal(6,2) default 0      # hours beyond standard_daily_hours
is_locked: bool (default False)             # locked once payroll for the period is finalized
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```
> Unique constraint on `(staff_id, attendance_date)`. `hours_worked` auto-computed on clock-out; `overtime_hours = max(0, hours_worked − standard_daily_hours)` using the effective branch setting. Once a payroll run for the month is APPROVED/PAID, all attendance rows in that period are `is_locked = true` and cannot be edited.

**Self clock-in/out:** staff linked to a `User` can clock in/out for themselves; managers can record/correct on their behalf (while unlocked).

---

#### PayrollRun (one per branch per month)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
run_number: str (unique)                    # PHARMAOPS-BR01-PR-2024-06
period_year: int
period_month: int                           # 1–12
status: Enum(DRAFT, APPROVED, PAID)
total_gross: Decimal(14,2)
total_deductions: Decimal(14,2)
total_net: Decimal(14,2)
total_epf_employee: Decimal(14,2)
total_epf_employer: Decimal(14,2)
total_etf_employer: Decimal(14,2)
total_paye_tax: Decimal(14,2)
approved_by: UUID (FK → User) | null
approved_at: datetime | null
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```
> Unique constraint on `(branch_id, period_year, period_month)`.

#### Payslip (one per staff per run)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
payroll_run_id: UUID (FK → PayrollRun)
staff_id: UUID (FK → StaffMember)
payslip_number: str (unique)                # PHARMAOPS-BR01-PS-2024-06-0001

# Inputs snapshot (from attendance + staff profile at run time)
pay_type: Enum(MONTHLY, HOURLY)
days_worked: int
days_absent: int
total_hours_worked: Decimal(8,2)
total_overtime_hours: Decimal(8,2)

# Earnings
basic_amount: Decimal(12,2)                 # MONTHLY: basic_salary; HOURLY: hours × rate
overtime_amount: Decimal(12,2)              # OT hours × rate × ot_multiplier
allowances_total: Decimal(12,2)
bonus_amount: Decimal(12,2) default 0       # one-off, entered per run
gross_pay: Decimal(12,2)                    # basic + OT + allowances + bonus

# Deductions
no_pay_amount: Decimal(12,2) default 0      # MONTHLY staff: absent days × daily rate
recurring_deductions_total: Decimal(12,2)   # loans/advances from StaffDeduction
epf_employee: Decimal(12,2)                 # employee EPF (default 8%)
paye_tax: Decimal(12,2) default 0           # from configurable slabs
other_deductions: Decimal(12,2) default 0   # one-off, entered per run
total_deductions: Decimal(12,2)
net_pay: Decimal(12,2)                       # gross − total_deductions

# Employer contributions (not deducted from staff; shown for records)
epf_employer: Decimal(12,2)                 # default 12%
etf_employer: Decimal(12,2)                 # default 3%

# Payment
payment_status: Enum(UNPAID, PAID)
payment_method: Enum(CASH, BANK_TRANSFER, CHEQUE) | null
payment_date: date | null
payment_reference: str | null

is_adjusted: bool (default False)            # true if manager manually overrode any computed figure
notes: str | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### PayslipLine (itemized breakdown for the printed payslip)
```
id: UUID (PK)
payslip_id: UUID (FK → Payslip)
line_type: Enum(EARNING, DEDUCTION, EMPLOYER_CONTRIBUTION)
label: str                                   # "Basic Salary", "Transport Allowance", "Staff Loan", "EPF 8%"
amount: Decimal(12,2)
is_editable: bool                            # one-off lines a manager can edit before finalizing
```

---

#### Payroll Calculation Logic

Run via `POST /hr/payroll-runs/` (creates a DRAFT run + draft payslips for all active staff). Per staff:

1. **Attendance aggregation** for the period: `days_worked`, `days_absent`, `total_hours_worked`, `total_overtime_hours` (sum from `StaffAttendance`).
2. **Basic amount:**
   - `MONTHLY` → `basic_salary`
   - `HOURLY` → `total_hours_worked × hourly_rate`
3. **Overtime:** `total_overtime_hours × base_hourly × ot_rate_multiplier`, where `base_hourly = hourly_rate` (hourly staff) or `basic_salary / (working_days_per_month × standard_daily_hours)` (monthly staff). `ot_rate_multiplier` falls back to the branch setting.
4. **No-pay (MONTHLY only):** `days_absent × (basic_salary / working_days_per_month)`.
5. **Allowances:** sum of active `StaffAllowance`. **Recurring deductions:** sum of active `StaffDeduction`.
6. **EPF/ETF/PAYE:** computed from configurable rates (see settings). EPF employee + employer on EPF-eligible earnings; ETF employer only; PAYE from configurable slabs.
7. **gross_pay**, **total_deductions**, **net_pay** rolled up; `PayslipLine` rows generated for the printout.
8. **Manager adjustment:** while run is `DRAFT`, a manager can edit one-off lines (bonus, other deductions) and override computed figures (`is_adjusted = true`). On **APPROVED**, attendance for the period locks; on **PAID**, payment fields are recorded.

#### HR Settings (configurable per branch via BranchSettings, with chain defaults)
Added to `BranchSettings` (and chain-level defaults where noted):
```
standard_daily_hours: Decimal(4,2) | null    # e.g. 8.00
working_days_per_month: int | null           # e.g. 26
ot_rate_multiplier: Decimal(5,2) | null      # e.g. 1.50
epf_employee_rate: Decimal(5,2) | null       # e.g. 8.00 (%)
epf_employer_rate: Decimal(5,2) | null       # e.g. 12.00 (%)
etf_employer_rate: Decimal(5,2) | null       # e.g. 3.00 (%)
paye_tax_slabs: array<object> | null                 # [{ "upto": 100000, "rate": 0 }, { "upto": 150000, "rate": 6 }, ...]
```
> All statutory rates are **stored as configurable values, never hardcoded**. Sri Lanka defaults seeded: EPF 8% employee / 12% employer, ETF 3% employer.

**HR Endpoints:**
- `GET /hr/staff/` | `POST /hr/staff/` | `GET /hr/staff/{id}` | `PATCH /hr/staff/{id}` | `DELETE /hr/staff/{id}`
- `POST /hr/staff/import/` | `PATCH /hr/staff/bulk-update/` | `DELETE /hr/staff/bulk-delete/`
- `GET/POST /hr/staff/{id}/qualifications/` | `GET/POST /hr/staff/{id}/documents/`
- `GET/POST /hr/staff/{id}/allowances/` | `GET/POST /hr/staff/{id}/deductions/`
- `GET /hr/attendance/` (filter: staff, date range, status) | `POST /hr/attendance/`
- `POST /hr/attendance/clock-in/` | `POST /hr/attendance/clock-out/` — self/manager
- `PATCH /hr/attendance/{id}` (blocked if `is_locked`) | `POST /hr/attendance/import/`
- `GET /hr/payroll-runs/` | `POST /hr/payroll-runs/` (generate DRAFT + payslips) | `GET /hr/payroll-runs/{id}`
- `POST /hr/payroll-runs/{id}/approve` (locks period attendance) | `POST /hr/payroll-runs/{id}/mark-paid`
- `GET /hr/payroll-runs/{id}/payslips/` | `GET /hr/payslips/{id}`
- `PATCH /hr/payslips/{id}` (one-off lines/overrides while run is DRAFT)
- `POST /hr/payslips/{id}/print/` — print-ready payslip payload

---

### 12. 💼 Account Module (Ledgers, Transfers, Expenses, Financial Statements)

A **full double-entry** accounting layer. Every financial event posts a balanced `JournalEntry` (total debits = total credits). All accounts are **branch-scoped**. A minimal **Chart of Accounts** classifies every ledger so a Trial Balance and Balance Sheet can be produced.

#### ChartOfAccount (minimal classification)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
code: str (unique per branch)        # e.g. "1100", "4000"
name: str                            # "Cash on Hand", "Sales Income", "Bank - BOC"
account_type: Enum(ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
normal_balance: Enum(DEBIT, CREDIT)  # ASSET/EXPENSE = DEBIT; LIABILITY/EQUITY/INCOME = CREDIT
is_system: bool (default False)       # seeded system accounts (Sales Income, Cash Over/Short, etc.)
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### Ledger (unified — one per Cash Registry / POS Terminal / Bank Account / Cheque Book, plus income/expense ledgers)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
chart_account_id: UUID (FK → ChartOfAccount)
name: str
ledger_type: Enum(CASH_REGISTRY, POS_TERMINAL, BANK_ACCOUNT, CHEQUE_BOOK,
                  INCOME, EXPENSE, PAYABLE, RECEIVABLE, EQUITY, OTHER)
current_balance: Decimal(14,2) default 0   # maintained from posted journal lines
is_active: bool
created_by / updated_by / created_at / updated_at
```
> Each operational account below **owns exactly one Ledger** (`ledger_id`). Sales income, salary expense, inventory, payables, Cash Over/Short, bank-fee expense, etc. are also Ledgers (linked to their CoA account).

#### CashRegistry
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
ledger_id: UUID (FK → Ledger, unique)      # ledger_type = CASH_REGISTRY
name: str                                   # "Counter 1 Drawer"
code: str (unique per branch)
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### CashRegistrySession (Open / Close)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
cash_registry_id: UUID (FK → CashRegistry)
session_number: str (unique)                # PHARMAOPS-BR01-CRS-2024-00001
opened_by: UUID (FK → User)
opened_at: datetime
opening_float: Decimal(12,2)                # starting cash
status: Enum(OPEN, CLOSED)
closed_by: UUID (FK → User) | null
closed_at: datetime | null
expected_cash: Decimal(12,2) | null         # opening_float + cash sales − cash payouts (system)
counted_cash: Decimal(12,2) | null          # physically counted at close
variance: Decimal(12,2) | null              # counted − expected (over = +, short = −)
notes: str | null
journal_entry_id: UUID (FK → JournalEntry) | null   # posted on close
created_by / updated_by / created_at / updated_at
```
> **One OPEN session per cashier (user) at a time.** Cash sales during the session map to this registry. **On close:** system computes `expected_cash`, user enters `counted_cash`, `variance` is derived. A balanced journal entry posts cash sales to the Cash Registry ledger; any non-zero `variance` posts to the **Cash Over/Short** expense account.

#### POSTerminal
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
ledger_id: UUID (FK → Ledger, unique)       # ledger_type = POS_TERMINAL
name: str                                    # "Card Machine - Counter 1"
terminal_id: str                             # provider terminal identifier
settlement_bank_account_id: UUID (FK → BankAccount)   # where batches settle
default_fee_percent: Decimal(5,2) default 0  # acquirer fee %
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### POSSettlement (batch settlement to bank, minus fees)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
pos_terminal_id: UUID (FK → POSTerminal)
settlement_number: str (unique)              # PHARMAOPS-BR01-POS-2024-00001
settlement_date: date
settlement_reference: str | null             # bank/acquirer batch reference
gross_amount: Decimal(12,2)                  # sum of included card payments
fee_amount: Decimal(12,2)                    # bank charges deducted
net_amount: Decimal(12,2)                    # gross − fee (credited to bank)
bank_account_id: UUID (FK → BankAccount)
journal_entry_id: UUID (FK → JournalEntry) | null
notes: str | null
created_by / updated_by / created_at / updated_at
```

#### POSSettlementItem (which card payments are in the batch)
```
id: UUID (PK)
pos_settlement_id: UUID (FK → POSSettlement)
customer_payment_id: UUID (FK → CustomerPayment)   # the CARD payment row
amount: Decimal(12,2)
```
> **On settlement:** posts a balanced journal — debit Bank (net_amount), debit Bank-Fee Expense (fee_amount), credit POS Terminal ledger (gross_amount).

#### BankAccount
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
ledger_id: UUID (FK → Ledger, unique)        # ledger_type = BANK_ACCOUNT
account_name: str
account_number: str
bank_name: str
bank_branch: str | null
swift_code: str | null
current_balance: Decimal(14,2) default 0     # mirrors ledger balance
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### ChequeBook (linked to a bank account)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
bank_account_id: UUID (FK → BankAccount)
ledger_id: UUID (FK → Ledger, unique)        # ledger_type = CHEQUE_BOOK
book_number: str
prefix: str | null
start_number: int
end_number: int
total_leaves: int                            # end − start + 1
leaves_remaining: int                        # computed
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### ChequeLeaf
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
cheque_book_id: UUID (FK → ChequeBook)
cheque_number: str (unique per book)
status: Enum(AVAILABLE, ISSUED, CLEARED, CANCELLED, BOUNCED) default AVAILABLE
payee: str | null
amount: Decimal(12,2) | null
issue_date: date | null
cleared_date: date | null
# polymorphic link to what the cheque paid for:
reference_type: Enum(EXPENSE, SUPPLIER_PAYMENT, FUND_TRANSFER, OTHER) | null
reference_id: UUID | null
journal_entry_id: UUID (FK → JournalEntry) | null    # posted on CLEARED
notes: str | null
created_by / updated_by / created_at / updated_at
```
> **Issued cheque posts its journal entry only when status → CLEARED**, not when written. CANCELLED/BOUNCED return the leaf appropriately (bounced reverses any provisional effect).

---

#### JournalEntry (header — balanced)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
entry_number: str (unique)                   # PHARMAOPS-BR01-JE-2024-00001
entry_date: date
source_type: Enum(MANUAL, SALE, PURCHASE_PAYMENT, PAYROLL, EXPENSE,
                  FUND_TRANSFER, CASH_SESSION, POS_SETTLEMENT, CHEQUE)
source_id: UUID | null                        # the originating record
memo: str | null
total_debit: Decimal(14,2)
total_credit: Decimal(14,2)                   # MUST equal total_debit
status: Enum(POSTED, REVERSED) default POSTED
reversed_by_entry_id: UUID (FK → JournalEntry) | null
created_by: UUID (FK → User)
updated_by: UUID (FK → User)
created_at: datetime
updated_at: datetime
```

#### JournalLine
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
journal_entry_id: UUID (FK → JournalEntry)
ledger_id: UUID (FK → Ledger)
direction: Enum(DEBIT, CREDIT)
amount: Decimal(14,2)
description: str | null
```
> **Invariants:** every entry has ≥2 lines; `sum(debit) == sum(credit)`; posting updates each `Ledger.current_balance`. Entries are **immutable once POSTED** — corrections are made via a reversing contra-entry (`status = REVERSED`, linked via `reversed_by_entry_id`), never by editing.

---

#### FundTransfer (any ledger → any ledger)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
transfer_number: str (unique)                # PHARMAOPS-BR01-FT-2024-00001
transfer_date: date
from_ledger_id: UUID (FK → Ledger)
to_ledger_id: UUID (FK → Ledger)
amount: Decimal(12,2)
transfer_type: Enum(CASH_DEPOSIT, CASH_WITHDRAWAL, BANK_TO_BANK, CHEQUE, OTHER)
cheque_leaf_id: UUID (FK → ChequeLeaf) | null   # set for cheque-based transfers
reference: str | null
notes: str | null
journal_entry_id: UUID (FK → JournalEntry) | null
created_by / updated_by / created_at / updated_at
```
> Posts a balanced entry — **debit destination ledger, credit source ledger**. Cash deposit (registry → bank) and withdrawal (bank → registry) are transfer types. Cheque-based transfers **consume a cheque leaf** (status → ISSUED, then CLEARED posts the entry).

---

#### ExpenseCategory (configurable)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
name: str                                    # "Rent", "Utilities", "Maintenance"
chart_account_id: UUID (FK → ChartOfAccount) # the EXPENSE account it posts to
is_active: bool
created_by / updated_by / created_at / updated_at
```

#### Expense
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
expense_number: str (unique)                 # PHARMAOPS-BR01-EXP-2024-00001
expense_category_id: UUID (FK → ExpenseCategory)
payee: str | null                            # vendor/payee name
expense_date: date
amount: Decimal(12,2)
paid_from_ledger_id: UUID (FK → Ledger)      # cash / bank / cheque ledger
cheque_leaf_id: UUID (FK → ChequeLeaf) | null
receipt_url: str | null                      # attached receipt/document
status: Enum(PENDING, APPROVED, POSTED, REJECTED) default PENDING
approved_by: UUID (FK → User) | null
approved_at: datetime | null
is_recurring: bool (default False)
recurrence: Enum(MONTHLY, QUARTERLY, YEARLY) | null
notes: str | null
journal_entry_id: UUID (FK → JournalEntry) | null   # posted on APPROVED/POSTED
created_by / updated_by / created_at / updated_at
```
> **Approval before posting:** an expense must be APPROVED before its journal entry posts (debit Expense account, credit the paid-from ledger). Recurring expenses are templated and generated on schedule (Celery).

---

#### Auto-Posting Rules (existing modules → Account module)
Each event posts a balanced `JournalEntry` with the matching `source_type`:

| Event | Debit | Credit |
|---|---|---|
| **Sale payment** (CASH) | Cash Registry ledger | Sales Income |
| **Sale payment** (CARD) | POS Terminal ledger | Sales Income |
| **Purchase payment** | Inventory / Accounts Payable | Cash / Bank ledger |
| **Payroll (mark-paid)** | Salary Expense | Cash / Bank ledger |
| **Expense (approved)** | Expense account | Paid-from ledger |
| **Fund transfer** | Destination ledger | Source ledger |
| **Cash session close** | Cash Registry ledger (+ Cash Over/Short for variance) | Sales Income / Cash Over/Short |
| **POS settlement** | Bank (net) + Bank-Fee Expense | POS Terminal ledger (gross) |
| **Cheque cleared** | per its reference (expense/payment/transfer) | per its reference |

---

#### Financial Statements

- **Trial Balance** — every Ledger with its total debits, total credits, and closing balance, grouped by `account_type`; total debits must equal total credits for a given period.
- **Balance Sheet** — Assets = Liabilities + Equity, as of a date. Assets (cash registries, bank accounts, cheque books, receivables, inventory), Liabilities (payables), Equity (retained earnings incl. period Income − Expense).
- Both honor branch scope; global users can consolidate across branches.

**Account Endpoints:**
- `GET/POST /accounts/chart-of-accounts/` | `PATCH /accounts/chart-of-accounts/{id}`
- `GET/POST /accounts/ledgers/` | `GET /accounts/ledgers/{id}` | `GET /accounts/ledgers/{id}/transactions` (statement)
- `GET/POST /accounts/cash-registries/` | `PATCH /accounts/cash-registries/{id}`
- `POST /accounts/cash-registries/{id}/open` | `POST /accounts/cash-sessions/{id}/close` | `GET /accounts/cash-sessions/`
- `GET/POST /accounts/pos-terminals/` | `PATCH /accounts/pos-terminals/{id}`
- `POST /accounts/pos-settlements/` (with items) | `GET /accounts/pos-settlements/` | `GET /accounts/pos-settlements/{id}`
- `GET/POST /accounts/bank-accounts/` | `PATCH /accounts/bank-accounts/{id}`
- `GET/POST /accounts/cheque-books/` | `GET /accounts/cheque-books/{id}/leaves/`
- `PATCH /accounts/cheque-leaves/{id}` (status transitions: issue, clear, cancel, bounce)
- `GET/POST /accounts/journal-entries/` (manual entries) | `GET /accounts/journal-entries/{id}` | `POST /accounts/journal-entries/{id}/reverse`
- `GET/POST /accounts/fund-transfers/` | `GET /accounts/fund-transfers/{id}`
- `GET/POST /accounts/expense-categories/`
- `GET/POST /accounts/expenses/` | `PATCH /accounts/expenses/{id}` | `POST /accounts/expenses/{id}/approve` | `POST /accounts/expenses/{id}/reject`
- `GET /accounts/reports/trial-balance?as_of=&branch_id=`
- `GET /accounts/reports/balance-sheet?as_of=&branch_id=`
- `GET /accounts/reports/ledger-statement?ledger_id=&start=&end=`
- All list endpoints support standard import/bulk-update/bulk-delete where applicable.

---

### 13. 📊 Reports Module

All endpoints support `branch_id` (global users can query across branches):

- `GET /reports/sales-summary?branch_id=&start=&end=`
- `GET /reports/sales-by-period?period=daily|weekly|monthly&branch_id=`
- `GET /reports/top-selling-products?limit=10&category_id=&start=&end=`
- `GET /reports/sales-by-category?start=&end=`
- `GET /reports/inventory-valuation?branch_id=`
- `GET /reports/profit-loss?start=&end=`
- `GET /reports/expiry-report`
- `GET /reports/low-stock`
- `GET /reports/purchase-summary?start=&end=&supplier_id=&channel_id=`
- `GET /reports/doctor-prescriptions?start=&end=&doctor_id=`
- `GET /reports/patient-history?patient_id=`
- `GET /reports/refill-adherence?start=&end=` — expected vs actual next-visit dates per prescription
- `GET /reports/refills-due?as_of=` — patients due for refill (expected_next_visit_date reached)
- `GET /reports/customer-credit-outstanding`
- `GET /reports/supplier-payment-outstanding`
- `GET /reports/sale-credit-notes?start=&end=`
- `GET /reports/purchase-credit-notes?start=&end=&status=`
- `GET /reports/staff-attendance-summary?start=&end=&staff_id=`
- `GET /reports/payroll-summary?year=&month=&branch_id=`
- `GET /reports/epf-etf-contributions?year=&month=` — statutory contribution report
- `GET /reports/expense-summary?start=&end=&category_id=` — expenses by category
- `GET /reports/cash-flow?start=&end=&branch_id=` — inflow/outflow across ledgers
> Note: the **Trial Balance** and **Balance Sheet** live in the Account module (§12) under `/accounts/reports/`.
- `GET /reports/end-of-day?branch_id=&date=`
- `GET /reports/stock-transfer-summary`
- `GET /reports/export?report=&format=csv|excel|pdf&start=&end=`

---

### 14. 🔔 Notifications Module

#### Notification
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
type: Enum(LOW_STOCK, EXPIRY_SOON, EXPIRED, TRANSFER_REQUEST,
           TRANSFER_RECEIVED, PAYMENT_DUE, DOCUMENT_EXPIRY, PAYROLL_DUE, REFILL_DUE, SYSTEM)
title: str
message: str
target_roles: str[]
related_entity_type: str | null
related_entity_id: UUID | null
created_at: datetime
```

#### NotificationRead
```
notification_id: UUID (FK)
user_id: UUID (FK)
read_at: datetime
```

**Celery Tasks (daily):** LOW_STOCK, EXPIRY_SOON, EXPIRED per branch; PAYMENT_DUE for overdue invoices; DOCUMENT_EXPIRY for staff documents/contracts nearing `expiry_date`; PAYROLL_DUE reminder near month-end if the current month's payroll run is not yet created; REFILL_DUE when a patient's `expected_next_visit_date` is reached (based on prescription days_needed).

---

### 15. 🖨️ Print & Output Module

Print-ready components using `@react-pdf/renderer` + `react-to-print`:

1. **Sale Invoice** — 80mm thermal + A4 layout; branch logo, invoice number, QR code (encodes invoice number for return lookup), itemized list, payment breakdown, loyalty points balance, footer text from BranchSettings
2. **Drug-Cover Label** — one label per dispensed prescription item (batch-print all at once): patient name, product name + generic name, **dosage instructions**, **special instructions** (from ProductGeneric), **days/duration + quantity issued**, dispensed by, date, branch name
3. **End-of-Day Report** — total sales by payment method, refunds, net cash, opened/closed by, branch, date
4. **Purchase Invoice** — supplier + channel, itemized goods, totals
5. **Payslip** — A4 layout per staff: employee code + name + designation, pay period, earnings breakdown (basic, OT, allowances, bonus), deductions (no-pay, recurring, EPF employee, PAYE, other), employer contributions (EPF/ETF), net pay, payment method/date, branch logo
6. **GRN (Goods Received Note)** — generated on Purchase Terminal finalize: supplier + channel, PI reference, received lines with batch/expiry/qty/cost, free qty, totals, received by, date
7. **Quotation / Sale Order** — order type, customer, validity + expected delivery dates, lines with quoted price/qty/free qty/discount, totals, branch logo + footer

---

### 16. 🔄 Branch Sync Module (on-premise → central HQ)

Each branch runs a **self-contained** PharmaOps install and **periodically syncs to a central HQ server** for consolidated, chain-wide reporting. The branch remains fully operational offline; sync resumes automatically when connectivity returns.

**Topology**
- **Branch node:** the standard PharmaOps install (all modules), authoritative for its own `branch_id` rows.
- **Central HQ node:** the same application running in a **HQ/consolidation mode** flag — aggregates all branches' data, **read-only for operational data** (used for chain-wide reports/dashboards), but **authoritative for pushed-down chain config** (Chain settings, shared product/brand/generic catalogue, promotions).

**Sync direction & conflict rule**
- **Up (branch → central):** one-way push of operational data (sales, sale orders, purchases, purchase orders, inventory movements, payments, prescriptions, HR, accounts). **Branch data is authoritative for its own rows** — central never overwrites a branch's operational records.
- **Down (central → branch):** chain-level config (Chain, ChainContact, shared catalogue, ChannelPromotions, chain-default settings) can be pushed back to branches.
- Transport: **REST API calls over HTTPS** with a per-branch API key/token.

**Mechanics**
- **Manual "Sync Now" button** (in Settings) **plus an automatic schedule** (Celery beat, configurable interval).
- **Delta sync:** each syncable table tracks a `last_synced_at` (and a monotonic `sync_version`); only rows changed since the last successful sync are sent — in batched, idempotent upserts keyed by the global UUID PK.
- **Resilience:** if HQ is unreachable, the branch queues deltas and retries with backoff; operations never block on sync.

#### SyncState (per branch node)
```
id: UUID (PK)
collection_name: str (unique)
last_synced_at: datetime | null
last_sync_version: bigint default 0
direction: Enum(UP, DOWN)
updated_at: datetime
```

#### SyncLog (audit of each sync run)
```
id: UUID (PK)
sync_type: Enum(MANUAL, SCHEDULED)
direction: Enum(UP, DOWN)
started_at: datetime
finished_at: datetime | null
status: Enum(RUNNING, SUCCESS, PARTIAL, FAILED)
records_pushed: int default 0
records_pulled: int default 0
error_message: str | null
created_at: datetime
```

**Sync Endpoints**
- **Branch side:** `POST /sync/run` (manual trigger; direction up+down), `GET /sync/status` (last run, pending deltas per table), `GET /sync/logs`
- **Central HQ side (ingest):** `POST /sync/ingest` (receive a branch's delta batch; idempotent upsert by UUID), `GET /sync/config` (serve chain config deltas down to a branch); both require the branch API token and an `X-Branch-ID`/`X-Node-Role` header.

> All sync writes are idempotent (upsert by UUID) and respect the conflict rule above. A row's `branch_id` plus `updated_at`/`sync_version` decide authority; central rejects up-pushes that would mutate another branch's config-owned rows.

---

### 17. 💾 Backup & Restore Module

On-premise per-branch installs need reliable, operator-friendly backups. PharmaOps supports **manual and scheduled full backups** to a **local folder**, with **configurable retention** and a **safe restore** path.

**A backup is a single archive** (`.zip` or `.tar.gz`) containing:
- **Database dump** — `mongodump` (custom/compressed format) of the branch database.
- **Uploaded files** — receipts, prescription scans, logos, staff documents, product images (the uploads directory).
- **Config** — a sanitized copy of `.env` and runtime settings (secrets masked/encrypted).
- **Manifest** — `manifest.json` with app version, schema/migration revision, branch id/code, timestamp, included parts, and a **SHA-256 checksum** of each part.

#### BackupConfig (per branch — single row)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
backup_directory: str                 # local folder path, e.g. C:\PharmaOpsBackups
schedule_enabled: bool (default True)
frequency: Enum(DAILY, WEEKLY)
run_at_time: time                     # e.g. 02:00
run_on_weekday: int | null            # 0–6 for WEEKLY
retention_mode: Enum(BY_COUNT, BY_AGE)
retention_count: int | null           # keep last N (BY_COUNT)
retention_days: int | null            # keep N days (BY_AGE)
include_uploads: bool (default True)
include_config: bool (default True)
updated_by: UUID (FK → User)
updated_at: datetime
```

#### BackupRecord (history of every backup)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
backup_number: str (unique)           # PHARMAOPS-BR01-BAK-2024-00001
trigger: Enum(MANUAL, SCHEDULED, PRE_RESTORE_SAFETY)
status: Enum(RUNNING, SUCCESS, FAILED)
file_path: str | null                 # full path to the archive
file_size_bytes: bigint | null
checksum_sha256: str | null
schema_version: str | null            # data-migration version captured
app_version: str | null
includes_uploads: bool
includes_config: bool
started_at: datetime
finished_at: datetime | null
error_message: str | null
created_by: UUID (FK → User) | null    # null for scheduled
created_at: datetime
```

#### RestoreRecord (audit of every restore)
```
id: UUID (PK)
branch_id: UUID (FK → Branch)
source_backup_id: UUID (FK → BackupRecord) | null   # null if uploaded external file
safety_backup_id: UUID (FK → BackupRecord) | null   # the auto pre-restore backup
status: Enum(RUNNING, SUCCESS, FAILED, ROLLED_BACK)
checksum_verified: bool
performed_by: UUID (FK → User)
started_at: datetime
finished_at: datetime | null
error_message: str | null
created_at: datetime
```

**Backup behavior**
- **Manual:** "Backup Now" in Settings → runs immediately, streams progress, records a `BackupRecord`.
- **Scheduled:** a Celery-beat job honors `BackupConfig` (daily/weekly at a set time); also runnable via the `backup-db.ps1` Windows Task Scheduler script as a fallback independent of the app.
- **Retention:** after each successful backup, prune by **count** or **age** per config.
- Each backup writes its **SHA-256 checksum** into the manifest for later verification.

**Restore safeguards** (all required)
- **ADMIN-only**, with **explicit typed confirmation** (e.g. type the branch code).
- **Verify checksum** of the chosen archive before proceeding; abort on mismatch.
- **Auto-create a safety backup** (`PRE_RESTORE_SAFETY`) first; on restore failure, **roll back** to it.
- **Stop app services** during restore, **restart** after (orchestrated; MongoDB stays up for the DB load).
- Available **in-app** (upload an external archive or pick a local one) **and** via **`restore-db.ps1`** PowerShell script for offline/disaster recovery.

**Backup Endpoints**
- `GET /backups/config` | `PATCH /backups/config`
- `POST /backups/run` — manual backup (ADMIN/MANAGER) | `GET /backups/` (history) | `GET /backups/{id}`
- `GET /backups/{id}/download` — download the archive
- `DELETE /backups/{id}` — remove an archive (respects ADMIN)
- `POST /backups/verify` — checksum-verify an archive (in-app or uploaded)
- `POST /backups/restore` — ADMIN-only; body references a BackupRecord or an uploaded file; enforces all safeguards above | `GET /backups/restores/` (restore history)

---

## INVOICE NUMBERING SYSTEM

Format: `{CHAIN_PREFIX}-{BRANCH_CODE}-{TYPE}-{YYYY}-{SEQUENCE}`

| Type | Example |
|---|---|
| Sale Invoice | `PHARMAOPS-BR01-SI-2024-00001` |
| Sale Order | `PHARMAOPS-BR01-SO-2024-00001` |
| Purchase Order | `PHARMAOPS-BR01-PO-2024-00001` |
| Purchase Invoice | `PHARMAOPS-BR01-PI-2024-00001` |
| Channel Rep Visit | `PHARMAOPS-BR01-VISIT-2024-00001` |
| Sale Credit Note | `PHARMAOPS-BR01-SCN-2024-00001` |
| Purchase Credit Note | `PHARMAOPS-BR01-PCN-2024-00001` |
| Stock Transfer | `PHARMAOPS-BR01-TRF-2024-00001` |
| Supplier Payment | `PHARMAOPS-BR01-SP-2024-00001` |
| Customer Payment | `PHARMAOPS-BR01-CP-2024-00001` |
| Staff Employee Code | `BR01-EMP-0001` |
| Payroll Run | `PHARMAOPS-BR01-PR-2024-06` (year-month, not sequential) |
| Payslip | `PHARMAOPS-BR01-PS-2024-06-0001` |
| Journal Entry | `PHARMAOPS-BR01-JE-2024-00001` |
| Cash Registry Session | `PHARMAOPS-BR01-CRS-2024-00001` |
| POS Settlement | `PHARMAOPS-BR01-POS-2024-00001` |
| Fund Transfer | `PHARMAOPS-BR01-FT-2024-00001` |
| Expense | `PHARMAOPS-BR01-EXP-2024-00001` |
| Backup | `PHARMAOPS-BR01-BAK-2024-00001` |

**InvoiceSequence collection** (atomic `findOneAndUpdate` with `$inc`):
```
unique compound index on (branch_id, type, year)
last_sequence: int
```
Sequence resets per year per branch per type.

---

## DARK / LIGHT MODE

- `next-themes` with `ThemeProvider` at root layout
- Tailwind `darkMode: 'class'`
- All color tokens as CSS variables in `globals.css` with `:root` (light) and `.dark` overrides
- `ThemeToggle` in Topbar (sun/moon icon), persists to `localStorage`
- No hardcoded colors anywhere — all via CSS variables

### Light Mode Tokens
```css
--background: #F8FAFC; --surface: #FFFFFF; --border: #E2E8F0;
--primary: #0F6CBD; --success: #107C10; --danger: #C50F1F; --warning: #F7630C;
--text: #0F172A; --text-muted: #64748B;
```

### Dark Mode Tokens
```css
--background: #0F1117; --surface: #1E2330; --border: #2D3748;
--primary: #3B9EE8; --success: #3DB83D; --danger: #E84040; --warning: #F59E0B;
--text: #F1F5F9; --text-muted: #94A3B8;
```

---

## BUSINESS LOGIC — KEY RULES

1. **FIFO Inventory:** Deduct from oldest non-expired batch first; never deduct from expired batches. `free_qty` also deducts FIFO but is not charged.
2. **Prescription Enforcement:** `requires_prescription=true` OR `controlled_substance_schedule != NONE` → must have linked verified prescription on sale.
3. **Tax-Inclusive Pricing:** Prices stored and displayed inclusive of tax. No tax line on invoice.
4. **Branch Isolation:** Every Beanie query MUST filter by `branch_id` from request context. Never trust `branch_id` from request body.
5. **created_by / updated_by:** Auto-injected from JWT by FastAPI dependency; never accepted from client.
6. **Basic-SKU Price Always:** `cost_price` and `selling_price` on every InventoryBatch and StockMovement are **per basic SKU unit**, never per pack. Pack-level entries are converted to basic units and prices divided accordingly before storage.
7. **Item Discounts (sale & purchase):** `discount_amount` is auto-calculated — `PERCENTAGE` → line_gross × discount_value/100; `FIXED` → discount_value. `subtotal = line_gross − discount_amount`. Never accept `discount_amount` directly from client; always recompute server-side.
8. **Purchase Effective Cost:** `effective_basic_cost = (subtotal) / ((quantity_received + free_qty) × sku_to_basic_factor)`. This is written to the inventory batch `cost_price` at receive time, so free qty and discounts both lower the per-unit cost.
9. **Supplier Payment Flow:** Payment to Supplier → `SupplierPaymentAllocation` rows settle PurchaseInvoices (debit) and/or apply PurchaseCreditNotes (credit) → update each invoice `amount_paid` + `payment_status` → update `supplier.outstanding_balance`. Supports combined (one payment → many invoices) and partial (many payments → one invoice).
10. **Purchase Credit Note Lifecycle:** Creating a PurchaseCreditNote only records it (status `ISSUED`). Inventory `quantity_remaining` reduction **and** `supplier.outstanding_balance` reduction happen **only when it is allocated to a SupplierPayment** (status → `APPLIED`, item `stock_reduced` → true).
11. **Purchase Return Eligibility:** Check `batch.expiry_date` vs `ProductBrand.return_expiry_before`. If `today + return_expiry_before ≥ batch.expiry_date`, item is within the brand's return window. Warn but allow override.
12. **Customer Payments:** `CustomerPayment` + `CustomerPaymentAllocation` support split (one invoice, many method rows) and combined (one payment, many invoices). At POS, payments are created with the sale invoice in one transaction. `CREDIT` method records no cash and increases `customer.credit_balance`.
13. **Sale Credit Note + Stock Restoration:** On `SaleCreditNote` creation with `stock_returned=true`, auto-increment original `batch.quantity_remaining`. (Note: unlike purchase credit notes, sale credit notes restore stock immediately.)
14. **Stock In / Stock Out:** `StockMovement` with `STOCK_IN` adds stock without an invoice (new batch or top-up existing). `STOCK_OUT` removes expired/damaged/lost stock from a batch with a reason. Both adjust `quantity_remaining`; prices stay per basic SKU unit.
15. **Stock Transfer Flow:** Initiating branch creates Transfer (PENDING) → Receiving branch approves (IN_TRANSIT) → Receiving branch confirms receipt (partial ok) → RECEIVED. Both branch inventories updated.
16. **SKU Conversions:** When purchasing in a pack SKU, convert to basic SKU quantity: `qty_basic = pack_qty × mapping.mapped_sku_count`.
17. **BranchSettings Inheritance:** `effective_value = branch_setting ?? chain_default`.
18. **Soft Deletes:** All entities use `is_active = false`. No hard deletes.
19. **Audit Log:** Every create/update/delete → `audit_logs` with embedded BSON before/after snapshots.
20. **Loyalty Points:** Earn = `floor(total_amount / loyalty_points_rate)`. Redeem at 1 point = 1 currency unit via `LOYALTY_POINTS` payment method.
21. **FormattedInput:** Amount/quantity inputs are `type="text"` — digits and `.` only. Format on blur, strip on focus.
22. **Staff vs User:** `StaffMember` is separate from `User`; `user_id` is optional. Staff without a login still appear in HR, attendance, and payroll.
23. **Attendance Hours:** `hours_worked` auto-computed from clock_in/clock_out; `overtime_hours = max(0, hours_worked − standard_daily_hours)` using the effective branch setting. Unique per `(staff_id, attendance_date)`.
24. **Attendance Lock:** When a PayrollRun for a month is APPROVED or PAID, all attendance rows in that period set `is_locked = true` and become read-only.
25. **Payroll Auto-Compute:** Payslips are generated from attendance + staff profile (basic/OT/no-pay/allowances/deductions/EPF/ETF/PAYE) per the calculation logic; managers may override one-off lines while the run is DRAFT (`is_adjusted = true`).
26. **Statutory Rates Configurable:** EPF/ETF/PAYE rates and slabs come from BranchSettings (chain defaults), never hardcoded. Employer EPF/ETF are recorded for reporting but not deducted from net pay.
27. **One Payroll Run per Branch per Month:** unique `(branch_id, period_year, period_month)`.
28. **Double-Entry Invariant:** Every `JournalEntry` has ≥2 lines and `sum(debit) == sum(credit)`. Reject unbalanced entries at the service layer.
29. **Immutable Postings:** POSTED journal entries are never edited or deleted — corrections post a reversing contra-entry (`status = REVERSED`). Ledger balances update only from posted lines.
30. **Ledger Ownership:** Each CashRegistry, POSTerminal, BankAccount, ChequeBook owns exactly one Ledger; income/expense/payable accounts are Ledgers too, each tied to a ChartOfAccount.
31. **Cash Session:** One OPEN session per cashier at a time. On close, `expected_cash` is system-computed, `counted_cash` entered, `variance = counted − expected`; a journal posts cash sales to the registry ledger and any variance to Cash Over/Short.
32. **POS Settlement:** Posts debit Bank (net) + debit Bank-Fee Expense (fee) + credit POS ledger (gross); items reference the included CARD `CustomerPayment` rows.
33. **Cheque Timing:** A cheque posts its journal entry only when `CLEARED`, not when issued. BOUNCED/CANCELLED handled without leaving stale balances; `leaves_remaining` maintained.
34. **Expense Approval:** Expenses post their journal entry only after APPROVED. Recurring expenses are generated on schedule via Celery.
35. **Auto-Posting:** Sale payments, purchase payments, payroll mark-paid, approved expenses, fund transfers, cash-session closes, POS settlements, and cleared cheques each post a balanced JournalEntry tagged with the matching `source_type`/`source_id`.
36. **Statements:** Trial Balance must balance (total debits = total credits); Balance Sheet must satisfy Assets = Liabilities + Equity. Both are branch-scoped, consolidatable for global users.
37. **Sale Terminal Session Guard:** Checkout is blocked unless the cashier has an OPEN `CashRegistrySession`; the terminal offers to auto-open one. Completed sales record `cash_session_id`.
38. **Multiple Prescriptions per Sale:** A SaleInvoice links to many prescriptions via `SaleInvoicePrescription`. Rx/controlled items still require at least one verified, matching prescription on the invoice.
39. **Parked Sales:** `is_parked = true` represents a suspended cart held as a draft (no stock deducted, no payment); resuming reactivates it. Stock and payments commit only on final checkout.
40. **Terminals Reuse Core Flows:** The Sale Terminal reuses `POST /sale-invoices/`; the Purchase Terminal reuses `POST /purchase-invoices/` + `/receive`. No separate GoodsReceivedNote model — "GRN" is the receiving UI + printable document. Both terminals are full-screen routes with their own shell, a Fullscreen-API toggle, an Exit button, a shared F-key shortcut scheme, and resume-on-navigation via server-side drafts.
41. **Channel Catalogue:** `ChannelProductMapping` defines what a channel supplies (with channel-specific cost/pack SKU, sort order). Default `ChannelPromotion` tags attach via `ChannelProductMappingPromotion`; promotions are structured (PERCENTAGE_DISCOUNT or BONUS_QTY buy/free) and may be default (always) or time-specific (date range). Multiple promotions can apply to one line.
42. **Rep Visit → PO:** A `ChannelRepVisit` (separate from HR attendance) logs the channel rep's visit and can spawn a `PurchaseOrder`. Default promotions auto-apply on the ordering screen; the buyer overrides per line and may add time-specific promos, which are **snapshotted** onto `PurchaseOrderItemPromotion` so historical terms survive later promotion edits.
43. **PO → Invoice Conversion:** A PurchaseOrder converts to one or more PurchaseInvoices (partial allowed); `qty_converted` tracks progress and status moves PLACED → PARTIALLY_CONVERTED → CONVERTED. The created PurchaseInvoice references `purchase_order_id` and carries qty, free qty, and promotion snapshots.
44. **Order Terminal Analytics:** existing qty = Σ `InventoryBatch.quantity_remaining` (branch); sold qty from `SaleInvoiceItem` history (last month / last 3 months); reorder indicator from `Product.reorder_level` (below ≤ R, near R<x<1.5R, safe ≥1.5R); competitor pricing = last `PurchaseInvoiceItem` per channel across up to 5 channels (incl. selected), cheapest/most-expensive flagged; side panels show last 5 channel invoices and matching `PurchaseCreditNote` return items.
45. **Sale Orders:** `SaleOrder` (QUOTATION / PRE_ORDER / STANDING_ORDER) is separate from SaleInvoice, links to a Customer and optionally multiple prescriptions, with editable `quoted_price` per line and `valid_until` + `expected_delivery_date`. No stock is deducted until conversion.
46. **Sale Order Reservation:** On CONFIRMED, an order may create **product-level soft reservations** (`SaleOrderReservation`) — these reduce *available-to-sell* (`available = on_hand − active_reservations`) for display but do **not** block other sales or pin a batch. Reservations release on convert, cancel, or quotation expiry (Celery flags expired quotations past `valid_until`).
47. **Sale Order → Invoice Conversion:** A SaleOrder converts to one or more SaleInvoices (partial allowed); `qty_invoiced` tracks progress and status moves CONFIRMED → PARTIALLY_INVOICED → INVOICED. The created SaleInvoice references `sale_order_id` and carries qty, free qty, quoted price, discounts, and prescription links; FIFO batch deduction happens at invoice time as usual.
48. **Prescription Item Mapping:** Each item maps to an exact `Product` when identifiable, else falls back to a `ProductGeneric`; the raw `prescribed_text` is always kept. Dispensing choices are persisted to `PrescribedItemMapping` at GLOBAL, PATIENT, and DOCTOR scopes (incrementing `use_count`) to improve future suggestions.
49. **Issuing Suggestions:** The dispensing terminal auto-populates up to four ranked options per item — (1) exact prescribed product, (2) patient's last-issued product for the generic, (3) lowest-price product for the generic, (4) most-profitable product for the generic — all stock-aware; the dispenser picks one or overrides.
50. **Prescription Dispensing:** Converts to a SaleInvoice (dispense now) or SaleOrder (quotation/pre-order). Partial dispensing is allowed; `quantity_dispensed`/issued may differ from `quantity_prescribed`; status moves PENDING → PARTIAL → DISPENSED. Controlled/Rx enforcement still applies.
51. **Days Needed & Adherence:** `days_needed` is captured at prescription level (course) and item level (per drug). `expected_next_visit_date = issue_date + days_needed` drives REFILL_DUE notifications; `actual_next_visit_date` (recorded on return) is compared against expected for adherence analysis.
52. **Drug-Cover Labels:** One label per dispensed item (batch-printable) with patient name, product + generic name, dosage instructions, special instructions (from ProductGeneric), days/duration, quantity issued, dispensed by, date, branch.
53. **On-Premise Per Branch:** Production runs as bundled **Windows Services** (NSSM) on one machine per branch — backend, frontend, Redis, Celery worker/beat — with native MongoDB; auto-start on boot and auto-restart on crash. A single installer provisions everything.
54. **Offline-First:** A branch operates fully even with no connection to HQ. All operational writes are local; nothing blocks on sync.
55. **Branch Sync Authority:** Operational data pushes **up** (branch → central, branch authoritative for its own rows); chain config pushes **down** (central → branch). Sync is delta-based (per-table `last_synced_at`/`sync_version`), idempotent (UUID upsert), over HTTPS with a per-branch token, triggered manually ("Sync Now") or on a Celery-beat schedule; failures queue and retry without blocking operations.
56. **Backups:** A backup is a single archive containing the `mongodump` database, uploads, and sanitized config, with a manifest + per-part SHA-256 checksum. Triggered manually ("Backup Now") or on a configurable daily/weekly schedule; old backups pruned by configurable count or age. A Windows Task Scheduler script provides an app-independent fallback.
57. **Restore Safety:** Restore is **ADMIN-only** with explicit typed confirmation; it **verifies the checksum**, takes an **automatic safety backup first** (rolling back to it on failure), and **stops then restarts app services** around the load. Available both in-app (pick/upload an archive) and via `restore-db.ps1`. Every restore is recorded in `RestoreRecord`.

**Role Permissions Matrix:**

| Action | CHAIN_ADMIN | CHAIN_MANAGER | BRANCH_MANAGER | PHARMACIST | CASHIER |
|---|:---:|:---:|:---:|:---:|:---:|
| Manage Chain/Branches | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ✅ | branch only | ❌ | ❌ |
| Manage Products & Categories | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create Sale Invoices | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Sale Orders (quotation/pre-order) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Issue Sale Credit Notes | ✅ | ✅ | ✅ | ❌ | ❌ |
| Issue Purchase Credit Notes | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage Purchase Invoices | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create Purchase Orders (rep visit) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage Channel Catalogue & Promotions | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Suppliers & Channels | ✅ | ✅ | ✅ | ❌ | ❌ |
| Stock In / Stock Out | ✅ | ✅ | ✅ | ✅ | ❌ |
| Approve Stock Transfers | ✅ | ✅ | ✅ | ❌ | ❌ |
| Make Supplier Payments | ✅ | ✅ | ✅ | ❌ | ❌ |
| Record Customer Payments | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Doctors & Patients | ✅ | ✅ | ✅ | ✅ | ❌ |
| Verify Prescriptions | ✅ | ✅ | ✅ | ✅ | ❌ |
| View Reports | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Audit Logs | ✅ | ✅ | ❌ | ❌ | ❌ |
| Branch Settings | ✅ | ✅ | ✅ | ❌ | ❌ |
| Chain Settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Staff | ✅ | ✅ | ✅ | ❌ | ❌ |
| Record Own Attendance | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit Others' Attendance | ✅ | ✅ | ✅ | ❌ | ❌ |
| Run / Approve Payroll | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Payslips (all staff) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Open / Close Cash Registry | ✅ | ✅ | ✅ | ✅ | ✅ |
| POS Settlement | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Bank Accounts / Cheque Books | ✅ | ✅ | ✅ | ❌ | ❌ |
| Fund Transfers | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create / Approve Expenses | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manual Journal Entries | ✅ | ✅ | ❌ | ❌ | ❌ |
| View Financial Statements | ✅ | ✅ | ✅ | ❌ | ❌ |
| Trigger Branch Sync | ✅ | ✅ | ✅ | ❌ | ❌ |
| Run / Configure Backups | ✅ | ✅ | ✅ | ❌ | ❌ |
| Restore from Backup | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## DEPLOYMENT (Windows Services, on-premise per branch)

PharmaOps ships as a **standalone Windows application installed on one machine per branch**. All long-running components run as **Windows Services** wrapped with **NSSM** (Non-Sucking Service Manager), set to **auto-start on boot** and **auto-restart on crash**.

### Components → Windows Services (via NSSM)
| Service | Command wrapped | Notes |
|---|---|---|
| `PharmaOps-Mongo` | MongoDB (native Windows installer) | its own service; **run as a single-node replica set** (enables ACID transactions); data dir under install path |
| `PharmaOps-Redis` | `redis-server.exe` (Windows build / Memurai) | cache, Celery broker |
| `PharmaOps-Backend` | `uvicorn app.main:app --host 127.0.0.1 --port 8000` (bundled Python) | FastAPI |
| `PharmaOps-Frontend` | `node server.js` (Next.js standalone build, bundled Node) | serves UI on `127.0.0.1:3000` |
| `PharmaOps-Celery` | `celery -A app.worker worker` | background jobs |
| `PharmaOps-Beat` | `celery -A app.worker beat` | scheduler (alerts, recurring expenses, sync) |

> A single umbrella service `PharmaOps` (NSSM) can depend on and orchestrate start/stop of all the above so the operator manages **one** service; individual services remain separately inspectable.

### Runtime bundling
- **Python** (embeddable distribution) and **Node** (portable) are **bundled inside the installer** — no separate runtime installs on the target machine.
- Backend built into a self-contained venv; frontend built with `next build` + `output: 'standalone'`.
- All paths, ports, the branch's `branch_id`, the central HQ URL, and the per-branch sync token live in a local `.env` written by the installer.

### Single Installer (.exe/.msi — Inno Setup or WiX)
On install, the package must:
1. Install/locate **MongoDB** natively, **initialize it as a single-node replica set** (for transactions), and register `PharmaOps-Mongo`.
2. Lay down the bundled Python/Node runtimes and the app build.
3. Create the database, **initialize collections + indexes** (and run any pending data-migrations), and **seed first-run data** (chain/branch identity captured during setup).
4. Register and **start all Windows Services** via NSSM with auto-start + auto-restart recovery.
5. Create a **kiosk desktop shortcut** that opens `http://127.0.0.1:3000` (full-screen browser / dedicated Chromium kiosk) for counter use.
6. Write `.env` with branch identity, HQ sync endpoint, and token.
7. Provide an **uninstaller** that stops + removes all services and (optionally) preserves the database.

### Operations
- **Logs:** each service logs to rotating files under `C:\ProgramData\PharmaOps\logs\` (structlog).
- **Backups:** manual + scheduled **full backups** (DB via `mongodump` + uploads + config) to a local folder, with configurable retention and safe restore — see the **Backup & Restore module** (§17). The `backup-db.ps1` / `restore-db.ps1` scripts (Windows Task Scheduler) provide an app-independent fallback.
- **Updates:** installer supports in-place upgrade — stop services → swap app build → run new migrations → restart services.
- **Health:** backend exposes `GET /health` (DB + Redis checks); a tray/CLI helper can show service status.
- **Central HQ node:** same installer run in **HQ/consolidation mode** (a setup flag); receives branch syncs and serves chain config (see Branch Sync module §16).

### Deliverables for deployment
- `installer/` — Inno Setup/WiX scripts, NSSM service definitions, bundled-runtime fetch scripts.
- `scripts/` — `install-services.ps1`, `start-all.ps1`, `stop-all.ps1`, `backup-db.ps1`, `restore-db.ps1`, `upgrade.ps1`.
- `README-DEPLOYMENT.md` — step-by-step branch install, HQ install, backup/restore, and troubleshooting.
- Docker Compose is retained **for development only** (`docker-compose.dev.yml`).

---

## SCAFFOLDING ORDER

Build in this exact sequence:

1. Dev environment: `docker-compose.dev.yml` + `.env` config (development only; production is Windows Services)
2. Backend core: database, config, security, `AuditBase`, `core/audit.py`, dependencies
3. Shared: `InvoiceSequence` model + generator utility
4. Chain module (Chain + ChainContact)
5. Branch module (Branch + BranchContact + BranchSettings)
6. Auth module
7. Users module
8. **Product sub-models:** ProductCategory tree, ProductSKU, StockLocation, ProductBrand, ProductGeneric
9. **Product core:** Product + ProductSKUMapping
10. Supplier + SupplierContact + DistributionChannel + ChannelContact + ChannelPromotion + ChannelProductMapping (+ promotions link) + ChannelRepVisit
11. Inventory module (batches, StockMovement Stock In/Out, transfers)
12. Purchase Order + Items (+ promotion snapshots) and Purchase Invoice module (free qty, discounts, basic-sku cost calc, PO→invoice conversion)
13. Supplier Payment + Allocation + Purchase Credit Note (in Supplier module)
14. Doctor module
15. Patient module
16. Prescription module (days_needed at prescription + item level, PrescribedItemMapping, dispensing terminal with 4-option suggestions → Sale Invoice/Order, drug-cover labels, refill adherence)
17. Customer + CustomerPatient + Customer Payment + Allocation
18. Sale Order + Items (+ prescriptions, reservations) and Sale Invoice module (FIFO, free qty, discounts, loyalty, SaleInvoicePrescription link, SO→invoice conversion)
19. Sale Credit Note module
20. HR module (StaffMember + qualifications/documents/allowances/deductions, StaffAttendance, PayrollRun + Payslip + PayslipLine, payroll calc)
21. Account module: ChartOfAccount + Ledger first, then CashRegistry/POSTerminal/BankAccount/ChequeBook, JournalEntry/JournalLine engine, FundTransfer, Expense + categories, cash sessions, POS settlements, financial statements. Then wire auto-posting hooks into Sales, Purchase Payments, Payroll, Expenses.
22. Reports module
23. Notifications module + Celery tasks (incl. recurring expenses, document expiry, payroll due)
24. Audit Log read endpoint
24b. Branch Sync module (SyncState, SyncLog, up/down delta sync, HQ ingest endpoints, "Sync Now" + Celery beat schedule)
24c. Backup & Restore module (BackupConfig, BackupRecord, RestoreRecord; manual + scheduled full backups, retention pruning, checksum verify, safe restore with pre-restore safety backup + service stop/restart)
25. Beanie document models registered + **index creation on startup** (+ versioned data-migration runner / `schema_migrations`)
26. `seed.py`
27. Frontend: Next.js shell (ThemeProvider, BranchSwitcher, Sidebar, Topbar, ThemeToggle)
28. Frontend: shared components (`FormattedInput`, `PhoneInput`, `DateTimeField`, `DataTable`, `ConfirmDialog`, `FilterPanel`, `ImportModal`, `ExportMenu`, `BulkActionsBar`, `AuditBadge`)
29. Frontend: `lib/utils/format.ts` (formatDate, formatDateTime, formatTime, formatPhone, formatAmount, formatNumber, parseFormattedNumber)
30. Frontend: `lib/utils/export.ts` (CSV, Excel, PDF helpers)
31. Frontend: each module in scaffolding order (8–24)
32. Frontend: Dashboard (KPIs + charts)
33. Frontend: **Sale Terminal (POS)**, **Sale Order Terminal (quotation/pre-order)**, **Purchase Terminal (GRN)**, and **Order Terminal (rep visit → PO)** — full-screen `TerminalShell`, shared keyboard shortcuts; Sale: product grid/keypad/quick-pay; Sale Order: order-type, quoted price, validity/delivery, reservation toggle, multi-prescription; Purchase: scan/batch entry; Order: mapped-product rows with reorder indicator, competitor pricing, promotion tag picker, recent invoices + returns panels; park/draft + resume, fullscreen toggle, quick-access launch buttons in the Sale and Purchase modules
34. Frontend: Print components (incl. Payslip); Settings: "Sync Now" + sync status panel, Backup (Backup Now, schedule/retention config, history, restore)
35. Frontend: Next.js standalone build config (`output: 'standalone'`)
36. **Windows packaging:** NSSM service definitions, PowerShell scripts (`install-services.ps1`, `start-all.ps1`, `stop-all.ps1`, `backup-db.ps1`, `upgrade.ps1`), bundled Python/Node runtimes, Inno Setup/WiX installer, kiosk shortcut, `GET /health` endpoint
37. `README.md` + `README-DEPLOYMENT.md`

---

## QUALITY REQUIREMENTS

- All Pydantic schemas — no raw dict returns
- All DB ops — async Beanie/Motor; multi-document writes wrapped in MongoDB transactions
- `branch_id` enforced at dependency layer only
- `created_by`/`updated_by` — JWT only, never client-supplied
- Full audit log via Beanie event hooks
- TanStack Query for all server state
- Zod + per-field errors on all forms
- `FormattedInput` used for **every** amount and quantity field
- `PhoneInput` used for **every** phone/mobile field; stored and validated as `### ### ####` (`/^\d{3} \d{3} \d{4}$/`)
- `formatDate` (`yyyy-MM-dd`) for date-only display; `formatDateTime` (`yyyy-MM-dd hh:mm a`) for all timestamps; `formatTime` (`hh:mm a`) for time-only fields
- Error boundaries on all dashboard sections
- Loading skeletons on all tables and charts
- Toast notifications for all CUD actions
- Responsive: 768px+ tablet for POS use
- Dark/light: CSS variables only — zero hardcoded colors
- Consistent error format: `{ "detail": "message", "code": "ERROR_CODE" }`
- Paginated response: `{ "items": [], "total": 0, "page": 1, "size": 25, "pages": 0 }`
- Import endpoint: `POST /{module}/import/` accepts `List[schema]`, returns `{ "imported": N }`
- Bulk update: `PATCH /{module}/bulk-update/` body: `{ "ids": [...] | "select_all": true, "updates": { fk_field: value } }`
- Bulk delete: `DELETE /{module}/bulk-delete/` body: `{ "ids": [...] | "select_all": true }`

---

## SEED DATA

`seed.py` must create:
- 1 Chain: "PharmaOps" (prefix: "PHARMAOPS"), with 2 chain contacts
- 3 Branches: BR01 (Colombo), BR02 (Kandy), BR03 (Galle); each with 2 contacts + BranchSettings (including sample storage_conditions, special_instructions, dosage_instructions lists)
- Users: 1 CHAIN_ADMIN, 1 CHAIN_MANAGER; per branch: 1 BRANCH_MANAGER + 1 PHARMACIST + 1 CASHIER
- 5 ProductSKU (Tablet/Tablets, Capsule/Capsules, Bottle/Bottles, Sachet/Sachets, Strip/Strips)
- 6 StockLocations per branch (Rack A–C, Refrigerator, Counter, Storeroom)
- 4 ProductBrand (with return_expiry_before values: 0, 30, 60, 180)
- 10 ProductGeneric (medicines: mix of dosage forms, schedules, with storage/instruction selections)
- Product category tree: Medicines (Antibiotics, Analgesics, Vitamins) | Groceries (Dairy, Beverages) | Cosmetics | Veterinary
- 30 Products (20 medicines linked to generics, 5 groceries, 3 cosmetics, 2 veterinary); several with SKU mappings
- 3 Suppliers, each with 1–2 contacts, 1–2 channels, and channel contacts
- Per channel: a ChannelProductMapping covering 8–15 products (with sort order, channel cost, pack SKU) and 2–3 ChannelPromotions (e.g. "5% Off", "10+1 Bonus", "20+3 Bonus") — some marked default, some time-specific; defaults attached to several mappings. Ensure ≥2 channels supply some of the same products so competitor pricing has data.
- 2–3 ChannelRepVisits per branch, each spawning a PurchaseOrder (mix of DRAFT/PLACED/PARTIALLY_CONVERTED/CONVERTED) with items, free qty, and promotion snapshots; converted ones linked to their PurchaseInvoice
- Inventory batches per branch (healthy, low stock, expiring soon, expired)
- 3–4 StockMovements per branch (mix of STOCK_IN opening balances and STOCK_OUT expired/damaged)
- 5 Doctors, 10 Patients, 8 Customers (some self-linked)
- 5 Prescriptions (mix of statuses), with days_needed at prescription + item level, items mapped to exact products and some generic-only (with prescribed_text); 1 partially dispensed, 1 fully dispensed (converted to a SaleInvoice), 1 converted to a SaleOrder; seed a few PrescribedItemMapping rows (GLOBAL/PATIENT/DOCTOR) so suggestions and one REFILL_DUE example are demonstrable
- 5 Purchase Invoices per branch (some items with free_qty and PERCENTAGE/FIXED discounts)
- 3 Supplier Payments with allocations across invoices
- 2 Purchase Credit Notes (1 still ISSUED, 1 APPLIED via a supplier payment to show stock + outstanding reduction)
- 10 Sale Invoices per branch (some walk-in, some with one or more prescriptions via SaleInvoicePrescription; items with free_qty + discounts); include 1 parked/held sale and link each completed sale to its cash session
- 4–5 Sale Orders per branch across all order types (QUOTATION with validity, PRE_ORDER, STANDING_ORDER); mix of statuses incl. 1 CONFIRMED with active reservations, 1 PARTIALLY_INVOICED, 1 INVOICED (linked to its SaleInvoice); some with quoted prices differing from current selling price
- Customer Payments: split-payment examples (cash+card) and 1 combined payment clearing multiple credit invoices
- 3 Sale Credit Notes (1 standard return, 1 exchange)
- 2 Stock Transfers between branches
- HR/Payroll settings seeded on BranchSettings (standard_daily_hours 8, working_days_per_month 26, ot_rate_multiplier 1.5, EPF 8/12, ETF 3, sample PAYE slabs)
- 6 StaffMembers per branch (mix of MONTHLY and HOURLY pay_type; mix of employment types; 3–4 linked to User accounts, others without login); each with 1–2 qualifications, 1–2 documents, and per-staff allowances + deductions
- ~20 working days of StaffAttendance per staff for the current and previous month (clock in/out, some OT, some absences)
- 1 PAID PayrollRun (previous month) with generated payslips, and 1 DRAFT PayrollRun (current month) to demonstrate the workflow
- Chart of Accounts per branch: seeded system accounts (Cash on Hand, Bank, Sales Income, Inventory, Accounts Payable, Salary Expense, Cash Over/Short, Bank Fee Expense, Rent/Utilities expenses, Retained Earnings) with codes + types
- Ledgers per branch: 2 Cash Registries, 1–2 POS Terminals, 2 Bank Accounts, 1 Cheque Book (with leaves), plus income/expense ledgers
- 1 OPEN and 1 CLOSED CashRegistrySession per branch (closed one with a small variance to show Cash Over/Short posting)
- 1–2 POS Settlements per branch (with fee deduction and bank posting)
- Expense categories (Rent, Utilities, Supplies, Maintenance) + 5 Expenses per branch (mix PENDING/APPROVED/POSTED, 1 recurring monthly rent, some cheque-paid)
- 2–3 Fund Transfers per branch (cash deposit registry→bank, bank→bank, 1 cheque-based)
- Auto-posted JournalEntries from seeded sales, purchase payments, payroll, expenses, transfers, sessions, and settlements — so Trial Balance and Balance Sheet are non-empty and balanced on first load
- A default BackupConfig per branch (local folder, daily schedule at 02:00, BY_COUNT retention keep 30, include uploads + config) and 1 sample SUCCESS BackupRecord

---

## DELIVERABLE

Complete, runnable codebase. Every file fully implemented — no `# TODO`, no stub functions, no placeholder components.

**Development:** `docker compose -f docker-compose.dev.yml up` → `python seed.py` → fully working application with realistic data, dark/light mode, all CRUD pages with import/export/bulk operations, formatted numbers and dates everywhere.

**Production (per branch):** running the **single Windows installer** sets up native MongoDB, lays down the bundled Python/Node runtimes, creates the DB + runs migrations + seeds first-run data, registers and starts all components as **NSSM Windows Services** (auto-start on boot, auto-restart on crash), and drops a kiosk desktop shortcut to the counter UI. Each branch runs self-contained offline and **syncs to the central HQ node** on a schedule (or via "Sync Now") for consolidated reporting. Include `README-DEPLOYMENT.md`, the installer scripts, NSSM service definitions, and PowerShell operational scripts.
