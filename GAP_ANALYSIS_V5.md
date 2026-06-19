# PharmaOps v5 Gap Analysis — TODO List

> Generated: 2026-06-19
> Compares `pharmaops-claude-code-prompt-v5.md` requirements against the current codebase.
> Status legend: `[x]` = Done, `[ ]` = Not started, `[~]` = Partially done

---

## 1. INFRASTRUCTURE & ARCHITECTURE

### 1.1 Backend Architecture Refactor
- [ ] **Migrate from raw PyMongo to Beanie ODM** — v5 requires Beanie (async, Motor-based) with Pydantic v2 Document models. Current codebase uses raw `pymongo.MongoClient` with a `Collections` class.
- [ ] **Create `AuditDocument` base class** — shared Beanie Document base with `id (UUID)`, `branch_id`, `created_at/updated_at`, `created_by/updated_by`, `is_active`. All collections must inherit this.
- [ ] **Add MongoDB replica set config** — required for multi-document ACID transactions (even single-node replica set).
- [ ] **Create `core/transactions.py`** — async transaction helper using Motor sessions for atomic multi-document operations.
- [ ] **Restructure backend to module-based layout** — v5 requires `app/modules/<domain>/` with `documents.py`, `router.py`, `service.py`, `schemas.py` per module. Current layout is flat `api/v1/` + `models/`.
- [ ] **Create `app/shared/` directory** — `base_document.py`, `base_schema.py`, `pagination.py`, `invoice_sequence.py`, `exceptions.py`.
- [ ] **Add `core/dependencies.py`** — `get_current_user`, `get_current_branch` FastAPI dependencies (separate from middleware).
- [ ] **Add `core/security.py`** — dedicated security module (currently mixed in middleware).
- [ ] **Add `core/audit.py`** — Beanie event hooks (`before_save`/`after_save`) for audit logging (currently middleware-based).

### 1.2 Redis & Celery
- [ ] **Add Redis integration** — `core/redis.py` for caching and Celery broker.
- [ ] **Add Celery worker + beat** — task queue for: expiry alerts, low stock alerts, recurring expenses, sync schedule, backup schedule, payroll reminders, refill-due notifications, expired quotation flagging.

### 1.3 Database & Data Modeling
- [ ] **Use UUID as `_id`** — globally unique across branches for sync. Current uses ObjectId.
- [ ] **Use `Decimal128`** for all monetary fields — v5 requires BSON Decimal128, not float.
- [ ] **Add `InvoiceSequence` collection** — atomic `findOneAndUpdate` with `$inc` for sequential numbering per `(branch_id, type, year)`.
- [ ] **Implement versioned data-migration runner** — `data_migrations/` directory + `schema_migrations` collection (replaces Alembic concept).
- [ ] **Index creation on startup** — register all Beanie Documents, build unique + compound + TTL indexes on app boot.

### 1.4 Dev Environment
- [ ] **Create `docker-compose.dev.yml`** — MongoDB + Redis for local development.
- [ ] **Create `.env.example` files** — for both frontend and backend.

---

## 2. BACKEND — MISSING MODULES

### 2.1 Chain Module (NEW)
- [ ] **Chain model + CRUD** — top-level owner entity with `name`, `logo_url`, `default_currency`, `invoice_prefix`.
- [ ] **ChainContact model + CRUD** — multiple contacts per chain with identifier, title, names, multi-channel contact fields.

### 2.2 Branch Module (ENHANCEMENT)
- [~] **Branch model** — exists but needs: `chain_id` FK, `city`, `license_number`, `operating_hours`, `branch_manager_id`.
- [ ] **BranchContact model + CRUD** — same structure as ChainContact, scoped to branch.
- [ ] **BranchSettings model + CRUD** — per-branch config: currency, logo, low_stock_threshold, expiry_alert_days, loyalty_points_rate, tax_enabled, invoice_footer_text, `storage_conditions[]`, `special_instructions[]`, `dosage_instructions[]`, HR/payroll rates (standard_daily_hours, working_days_per_month, ot_rate_multiplier, EPF/ETF rates, PAYE slabs).

### 2.3 Product Module (MAJOR REFACTOR)
- [~] **ProductCategory** — exists but needs unlimited-depth tree with `parent_id`, `slug`, `icon`, `color`, `level`, materialized `path`.
- [~] **ProductSKU** — exists but needs `plural`, `sku_type` enum (COUNT, WEIGHT, VOLUME, LENGTH).
- [ ] **StockLocation model + CRUD** — shelf/rack locations per branch (`name`, `code`). Currently missing as a standalone CRUD module.
- [~] **ProductBrand** — exists but needs `manufacturer`, `country_of_origin`, `return_expiry_before` (days for purchase return eligibility).
- [~] **ProductGeneric** — exists but needs: `dosage_form` enum, `controlled_substance_schedule` enum, `active_ingredients`, `side_effects[]`, `drug_interactions`, `local_license_number`, `storage_conditions[]`, `special_instructions[]`, `dosage_instructions[]` (picked from BranchSettings), `stock_location_id`.
- [~] **Product** — exists but needs restructuring: remove `generic_name`/`brand`/`sku`/`unit`/`pack_size` strings → use FK references to `category_id`, `brand_id`, `generic_id`, `basic_sku_id`. Add `barcode`, `image_url`, `is_taxable`, `reorder_level`.
- [ ] **ProductSKUMapping model + CRUD** — pack-size conversions (e.g., 1 Box = 100 Tablets).

### 2.4 Supplier Module (MAJOR ENHANCEMENT)
- [~] **Supplier** — exists with v2 redesign (Agency/Distributor). Needs alignment with v5 fields.
- [ ] **SupplierContact model + CRUD** — separate contact entities per supplier.
- [~] **DistributionChannel** — partially exists. Needs full CRUD alignment.
- [ ] **ChannelContact model + CRUD** — contacts per distribution channel.
- [ ] **ChannelPromotion model + CRUD** — reusable promotion tags (PERCENTAGE_DISCOUNT, BONUS_QTY) with validity dates.
- [ ] **ChannelProductMapping model + CRUD** — channel's ordered product catalogue with channel-specific cost/pack SKU/sort order.
- [ ] **ChannelProductMappingPromotion** — link table for default promotions per mapping.
- [ ] **ChannelRepVisit model + CRUD** — sales rep visit log with auto-numbering.
- [ ] **SupplierPayment + SupplierPaymentAllocation** — combined/partial payment with allocations to invoices and credit notes.
- [ ] **PurchaseCreditNote + PurchaseCreditNoteItem** — return to supplier with lifecycle (DRAFT→ISSUED→APPLIED→CANCELLED). Stock reduction only on APPLIED.

### 2.5 Inventory Module (ENHANCEMENT)
- [~] **InventoryBatch** — exists but needs `channel_id`, `purchase_invoice_id`, `location_id`, `manufacture_date`. Prices must be per basic SKU unit.
- [ ] **StockMovement model + CRUD** — Stock In (new batch or top-up without invoice) and Stock Out (expired/damaged/lost with reason enum). Replaces any existing ad-hoc stock adjustment.
- [~] **StockTransfer** — exists but needs alignment with v5 statuses (PENDING, IN_TRANSIT, PARTIALLY_RECEIVED, RECEIVED, CANCELLED).

### 2.6 Purchase Order Module (ENHANCEMENT)
- [~] **PurchaseOrder** — exists but needs: `channel_id`, `rep_visit_id`, status enum (DRAFT, PLACED, PARTIALLY_CONVERTED, CONVERTED, CANCELLED), partial conversion support.
- [ ] **PurchaseOrderItem** — needs `purchase_sku_id`, `free_qty`, `qty_converted`.
- [ ] **PurchaseOrderItemPromotion** — promotion snapshots per PO line.
- [ ] **PO → PI conversion endpoint** — `POST /purchase-orders/{id}/convert` with partial conversion support.

### 2.7 Purchase Invoice Module (ENHANCEMENT)
- [~] **PurchaseInvoice** — exists but needs: `channel_id`, `purchase_order_id`, `supplier_invoice_number`, status updates (DRAFT→CONFIRMED→PARTIALLY_RECEIVED→RECEIVED), `payment_status`, `amount_paid`, `outstanding_amount`.
- [ ] **PurchaseInvoiceItem** — needs `purchase_sku_id`, `free_qty`, `discount_type/value/amount`, `effective_basic_cost` auto-calculation.
- [ ] **Receive endpoint** — `POST /purchase-invoices/{id}/receive` creating InventoryBatch records.

### 2.8 Customer Module (ENHANCEMENT)
- [~] **Customer** — exists but needs: `title` enum, `nic_number`, `loyalty_points`, `credit_balance`.
- [ ] **CustomerPatient link** — many-to-many with `relationship` and `is_primary`.
- [ ] **CustomerPayment + CustomerPaymentAllocation** — split and combined payment support. Replaces current billing payments.

### 2.9 Sale Order Module (MAJOR ENHANCEMENT)
- [~] **SaleOrder** — exists but needs: `order_type` enum (QUOTATION, PRE_ORDER, STANDING_ORDER), `valid_until`, `expected_delivery_date`, `is_reserved`, conversion support.
- [ ] **SaleOrderItem** — needs `free_qty`, `quoted_price`, `discount_type/value/amount`, `qty_invoiced`.
- [ ] **SaleOrderPrescription** — link table (multiple prescriptions per order).
- [ ] **SaleOrderReservation** — product-level soft reservation for confirmed orders.
- [ ] **SO → SI conversion endpoint** — `POST /sale-orders/{id}/convert`.

### 2.10 Sale Invoice Module (MAJOR REFACTOR)
- [~] **SaleInvoice** — exists (as `sales.py`) but needs major restructuring: `sale_order_id`, `cash_session_id`, `is_parked`, `change_given`, FIFO batch selection, free_qty support.
- [ ] **SaleInvoicePrescription** — link table (multiple prescriptions per invoice, replacing single FK).
- [ ] **SaleInvoiceItem** — needs `batch_id` (FIFO), `free_qty`, `discount_type/value/amount`.
- [ ] **SaleCreditNote + SaleCreditNoteItem** — return/refund/exchange with stock restoration.

### 2.11 Prescription Module (ENHANCEMENT)
- [~] **Prescription** — exists but needs: `days_needed`, `expected_next_visit_date`, `actual_next_visit_date`, `verified_by/at`.
- [~] **PrescriptionItem** — needs: `prescribed_text`, `generic_id` fallback, `days_needed` (item-level), `quantity_dispensed`.
- [ ] **PrescribedItemMapping model** — learned mapping (GLOBAL/PATIENT/DOCTOR scopes) with `use_count` for improving suggestions.
- [ ] **Dispensing suggestions endpoint** — `GET /prescriptions/{id}/dispense/suggestions` returning 4 ranked options per item.
- [ ] **Dispensing endpoint** — `POST /prescriptions/{id}/dispense` creating SaleInvoice or SaleOrder.
- [ ] **Refill adherence** — `PATCH /prescriptions/{id}/record-return` for actual_next_visit_date.

### 2.12 HR Module (ENHANCEMENT)
- [~] **StaffMember** — exists but needs full v5 fields: `employee_code`, `nic_number`, `emergency contacts`, `employment_tenure`, `pay_type`, `bank details`, compensation fields.
- [ ] **StaffQualification model + CRUD** — qualifications per staff.
- [ ] **StaffDocument model + CRUD** — contracts/certificates/ID scans with expiry.
- [ ] **StaffAllowance model + CRUD** — recurring per-staff allowances.
- [ ] **StaffDeduction model + CRUD** — recurring per-staff deductions (loan/advance).
- [~] **StaffAttendance** — exists but needs: `hours_worked` auto-compute, `overtime_hours` auto-compute, `is_locked` for payroll.
- [~] **PayrollRun** — exists but needs: full auto-compute logic (basic/OT/no-pay/allowances/deductions/EPF/ETF/PAYE), `run_number`, approval flow.
- [~] **Payslip** — exists but needs: full earnings/deductions breakdown, `PayslipLine` items, `is_adjusted`, payment tracking.
- [ ] **PayslipLine model** — itemized breakdown for printed payslips.
- [ ] **Payroll calculation engine** — per v5 logic: attendance aggregation, basic amount, overtime, no-pay, allowances, EPF/ETF/PAYE from configurable rates.

### 2.13 Account Module (MAJOR ENHANCEMENT)
- [ ] **ChartOfAccount model + CRUD** — account classification (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) with `normal_balance`.
- [~] **Ledger** — partially exists (treasury) but needs full v5 structure: unified ledger with `ledger_type` enum, `chart_account_id`, `current_balance`.
- [~] **CashRegistry + CashRegistrySession** — partially exists (billing/registries). Needs: `ledger_id`, `session_number`, `expected_cash`, `counted_cash`, `variance`, `journal_entry_id`.
- [~] **POSTerminal** — exists (pos_machines) but needs: `ledger_id`, `settlement_bank_account_id`, `default_fee_percent`.
- [ ] **POSSettlement + POSSettlementItem** — batch card settlement to bank with fee deduction and journal posting.
- [~] **BankAccount** — exists but needs `ledger_id`, proper balance tracking.
- [~] **ChequeBook + ChequeLeaf** — exists but needs: `ledger_id`, leaf status lifecycle (AVAILABLE→ISSUED→CLEARED→CANCELLED→BOUNCED), polymorphic reference, journal posting only on CLEARED.
- [ ] **JournalEntry + JournalLine** — double-entry engine. Balanced entries (debits = credits), immutable once POSTED, reversing contra-entries for corrections.
- [~] **FundTransfer** — exists (ledger/transfers) but needs: `journal_entry_id`, cheque-leaf consumption, proper ledger balance updates.
- [ ] **ExpenseCategory model + CRUD** — configurable categories linked to ChartOfAccount.
- [ ] **Expense model + CRUD** — with approval flow (PENDING→APPROVED→POSTED→REJECTED), recurring support, journal posting on approval.
- [ ] **Auto-posting hooks** — wire all financial events (sales, purchase payments, payroll, expenses, fund transfers, cash sessions, POS settlements, cheques) to post balanced JournalEntries.
- [ ] **Trial Balance endpoint** — `GET /accounts/reports/trial-balance`.
- [ ] **Balance Sheet endpoint** — `GET /accounts/reports/balance-sheet`.
- [ ] **Ledger Statement endpoint** — `GET /accounts/reports/ledger-statement`.

### 2.14 Sync Module (NEW)
- [ ] **SyncState model** — per-collection last_synced_at + sync_version.
- [ ] **SyncLog model** — audit of each sync run.
- [ ] **Branch → HQ delta push** — operational data up-sync (batched, idempotent UUID upserts).
- [ ] **HQ → Branch config pull** — chain-level config down-sync.
- [ ] **Sync Now endpoint** — `POST /sync/run`.
- [ ] **Sync status endpoint** — `GET /sync/status`.
- [ ] **HQ ingest endpoint** — `POST /sync/ingest`.
- [ ] **Celery beat schedule** — automatic periodic sync.

### 2.15 Backup & Restore Module (NEW)
- [ ] **BackupConfig model** — per-branch backup settings (directory, schedule, retention).
- [ ] **BackupRecord model** — history of every backup.
- [ ] **RestoreRecord model** — audit of every restore.
- [ ] **Backup engine** — `mongodump` + uploads + config → archive with SHA-256 manifest.
- [ ] **Restore engine** — checksum verify, pre-restore safety backup, service stop/restart.
- [ ] **Backup CRUD endpoints** — config, run, history, download, verify, restore.
- [ ] **Scheduled backups** — Celery beat daily/weekly.
- [ ] **`backup-db.ps1` / `restore-db.ps1`** — Windows Task Scheduler fallback scripts.

---

## 3. BACKEND — MISSING ENDPOINTS & FEATURES

### 3.1 Auth Enhancements
- [ ] **`POST /auth/refresh`** — token refresh endpoint.
- [ ] **`POST /auth/switch-branch/{branch_id}`** — global users only.

### 3.2 Bulk Operations (all modules)
- [ ] **Import endpoints** — `POST /{module}/import/` accepting `List[schema]`.
- [ ] **Bulk update endpoints** — `PATCH /{module}/bulk-update/` with `ids[]` or `select_all`.
- [ ] **Bulk delete endpoints** — `DELETE /{module}/bulk-delete/` with `ids[]` or `select_all`.

### 3.3 Reports (ENHANCEMENT)
- [ ] **Refill adherence report** — `GET /reports/refill-adherence`.
- [ ] **Refills due report** — `GET /reports/refills-due`.
- [ ] **EPF/ETF contributions report** — `GET /reports/epf-etf-contributions`.
- [ ] **Expense summary report** — `GET /reports/expense-summary`.
- [ ] **Cash flow report** — `GET /reports/cash-flow`.
- [ ] **Sale/Purchase credit note reports** — with date/status filters.
- [ ] **Payroll summary report** — `GET /reports/payroll-summary`.
- [ ] **Staff attendance summary** — `GET /reports/staff-attendance-summary`.

### 3.4 Notifications (ENHANCEMENT)
- [ ] **DOCUMENT_EXPIRY notifications** — staff documents/contracts nearing expiry.
- [ ] **PAYROLL_DUE notifications** — reminder if current month payroll not created.
- [ ] **REFILL_DUE notifications** — patient expected_next_visit_date reached.

### 3.5 Other
- [ ] **`GET /health` endpoint** — DB + Redis connectivity checks.
- [ ] **Consistent error format** — `{ "detail": "message", "code": "ERROR_CODE" }`.
- [ ] **Paginated response format** — `{ "items": [], "total": 0, "page": 1, "size": 25, "pages": 0 }`.

---

## 4. FRONTEND — MISSING SHARED COMPONENTS

### 4.1 Input Components
- [ ] **FormattedInput** — `type="text"` for amounts/quantities. Digits + `.` only on keystroke. Format on blur, strip on focus. Variant prop: `"amount" | "number"`.
- [ ] **PhoneInput** — `type="text"`, digits only, auto-format `### ### ####` on blur, regex validated.
- [ ] **DateTimeField** — date/datetime/time picker with variant prop. Emits ISO 8601, displays formatted.

### 4.2 Table & List Components
- [ ] **DataTable refactor** — add row-level checkbox selection, select-all-on-page, select-all-filtered banner, sortable columns.
- [ ] **FilterPanel** — collapsible drawer/popover with per-module filter fields, Apply/Clear buttons, active count badge.
- [ ] **BulkActionsBar** — appears when ≥1 row selected: bulk export, bulk update, delete selected, clear.
- [ ] **ExportMenu** — dropdown: Export CSV (papaparse), Export Excel (SheetJS), Export PDF (@react-pdf/renderer).
- [ ] **ImportModal refactor** — add row-by-row inline validation, editable preview cells, green/red row highlighting, fix-in-place support.
- [ ] **SearchInput** — standalone debounced (300ms) search component.

### 4.3 Display Components
- [ ] **AuditBadge** — shows created_by, updated_by, timestamps.
- [ ] **EmptyState** — empty table/section placeholder.
- [ ] **StatusBadge enhancement** — ensure all v5 status enums are covered.

### 4.4 Terminal Components
- [ ] **TerminalShell** — minimal full-screen shell (no sidebar) for all terminal views.
- [ ] **FullscreenToggle** — Fullscreen API toggle button.
- [ ] **NumericKeypad** — on-screen keypad for qty/discount in terminals.
- [ ] **useKeyboardShortcuts hook** — shared F-key shortcut handler for all terminals.

### 4.5 Layout Components
- [ ] **BranchSwitcher** — global users can switch active branch context. Sets `X-Branch-ID` header.
- [ ] **Topbar** — replace/enhance Header with branch display, BranchSwitcher, ThemeToggle, user menu.
- [ ] **PageHeader** — reusable page header with title, breadcrumb, actions.

---

## 5. FRONTEND — MISSING PAGES & FEATURES

### 5.1 Chain Module (NEW)
- [ ] **Chain settings page** — `/chain/page.tsx` with chain info + contacts CRUD.

### 5.2 Product Module
- [ ] **Stock Locations page** — `/stock-locations/page.tsx` with CRUD.
- [ ] **SKU Mappings UI** — manage pack-size conversions per product.
- [ ] **Category tree manager** — unlimited-depth tree editor (drag-drop, add/edit/remove nodes).

### 5.3 Supplier Module
- [ ] **Supplier detail page** — `/suppliers/[id]/page.tsx` with contacts, channels, payment history.
- [ ] **Channel management UI** — contacts, promotions, product mappings, rep visits within supplier detail.
- [ ] **Purchase Credit Notes page** — `/purchase-credit-notes/page.tsx`.
- [ ] **Supplier Payments page** — `/supplier-payments/page.tsx` with multi-invoice allocation.

### 5.4 Sale Module
- [ ] **Sale Invoices list page** — `/sale-invoices/page.tsx` (separate from POS).
- [ ] **Sale Invoice detail page** — `/sale-invoices/[id]/page.tsx`.
- [ ] **New Sale Invoice form** — `/sale-invoices/new/page.tsx`.
- [ ] **Sale Credit Notes page** — `/sale-credit-notes/page.tsx`.
- [ ] **Customer Payments page** — `/customer-payments/page.tsx`.
- [ ] **Customer detail page** — `/customers/[id]/page.tsx` with sale history, credit notes, linked patients.

### 5.5 Purchase Module
- [ ] **Purchase Order detail page** — `/purchase-orders/[id]/page.tsx` with convert-to-invoice action.
- [ ] **Purchase Invoice detail page** — `/purchase-invoices/[id]/page.tsx`.
- [ ] **New Purchase Invoice form** — `/purchase-invoices/new/page.tsx`.

### 5.6 Prescription Module
- [ ] **Prescription detail page** — `/prescriptions/[id]/page.tsx` with dispense panel.
- [ ] **Dispensing terminal** — `/prescriptions/[id]/dispense/page.tsx` full-screen with 4-option suggestions.
- [ ] **Drug-cover label printing** — batch-print labels per dispensed item.

### 5.7 HR Module
- [ ] **Staff detail page** — `/hr/staff/[id]/page.tsx` with qualifications, documents, allowances, deductions tabs.
- [ ] **Payroll run detail page** — `/hr/payroll/[id]/page.tsx` with payslips list.
- [ ] **Payslip view/print page** — `/hr/payslips/[id]/page.tsx`.

### 5.8 Account Module
- [ ] **Chart of Accounts page** — `/accounts/chart-of-accounts/page.tsx`.
- [ ] **Ledger list + statement page** — `/accounts/ledgers/page.tsx`, `/accounts/ledgers/[id]/page.tsx`.
- [ ] **Cash Registries page** — `/accounts/cash-registries/page.tsx` with open/close sessions.
- [ ] **POS Terminals + Settlements pages**.
- [ ] **Journal Entries page** — `/accounts/journal-entries/page.tsx`.
- [ ] **Fund Transfers page enhancement** — journal posting integration.
- [ ] **Expenses + Categories pages** — `/accounts/expenses/page.tsx`, `/accounts/expenses/categories/page.tsx` with approval flow.
- [ ] **Trial Balance page** — `/accounts/reports/trial-balance/page.tsx`.
- [ ] **Balance Sheet page** — `/accounts/reports/balance-sheet/page.tsx`.

### 5.9 Terminal Pages (NEW — full-screen)
- [ ] **Sale Terminal (POS)** — `/sale-invoices/terminal/page.tsx` with product grid, cart, quick-pay, parked sales, cash session guard, keyboard shortcuts.
- [ ] **Sale Order Terminal** — `/sale-orders/terminal/page.tsx` with order type, quoted prices, validity, reservations.
- [ ] **Purchase Terminal (GRN)** — `/purchase-invoices/terminal/page.tsx` with barcode scan, batch entry, running totals, partial receiving.
- [ ] **Order Terminal (Rep Visit → PO)** — `/purchase-orders/terminal/page.tsx` with mapped products, reorder indicators, competitor pricing, promotion tags, recent invoices/returns panels.

### 5.10 Settings Pages
- [ ] **Chain settings page** — `/settings/chain/page.tsx`.
- [ ] **Branch settings page** — `/settings/branch/page.tsx` with HR/payroll rates, master lists.
- [ ] **Sync settings page** — `/settings/sync/page.tsx` with Sync Now, status, logs.
- [ ] **Backup settings page** — `/settings/backup/page.tsx` with Backup Now, schedule, retention, history, restore.

---

## 6. FRONTEND — STATE & DATA MANAGEMENT

- [ ] **Zustand stores** — `useAuthStore`, `useBranchStore`, `useThemeStore` (currently no Zustand).
- [ ] **TanStack Query** — replace current data fetching with TanStack Query for all server state.
- [ ] **Axios `X-Branch-ID` header** — auto-inject on every request from branch store.
- [ ] **`lib/utils/format.ts`** — `formatDate`, `formatDateTime`, `formatTime`, `formatPhone`, `formatAmount`, `formatNumber`, `parseFormattedNumber` as dedicated utility functions.
- [ ] **`lib/utils/export.ts`** — CSV (papaparse), Excel (SheetJS), PDF (@react-pdf/renderer) export helpers.

---

## 7. FRONTEND — PRINT & PDF

- [ ] **Sale Invoice print** — 80mm thermal + A4 with QR code, payment breakdown, loyalty points.
- [ ] **Drug-Cover Label print** — per dispensed item with dosage/special instructions.
- [ ] **End-of-Day Report print**.
- [ ] **Purchase Invoice print**.
- [ ] **Payslip print** — A4 with full earnings/deductions breakdown.
- [ ] **GRN print** — on Purchase Terminal finalize.
- [ ] **Quotation / Sale Order print**.

---

## 8. ROLE & PERMISSION CHANGES

- [ ] **Rename roles** — Current: `BRANCH_USER → BRANCH_MANAGER → BRANCH_ADMIN → MANAGER → ADMIN`. V5: `CASHIER → PHARMACIST → BRANCH_MANAGER → CHAIN_MANAGER → CHAIN_ADMIN`.
- [ ] **Implement full role permissions matrix** — per v5 table (§ Role Permissions Matrix) with granular per-action enforcement.

---

## 9. FORMATTING & UX STANDARDS

- [ ] **Amount formatting everywhere** — `###,###.##` (2 decimal, comma thousands).
- [ ] **Quantity formatting everywhere** — `###,###` (comma thousands, no decimals).
- [ ] **FormattedInput for all amount/qty fields** — replace `type="number"` inputs.
- [ ] **PhoneInput for all phone fields** — replace raw text inputs.
- [ ] **Loading skeletons on all tables and charts**.
- [ ] **Error boundaries on all dashboard sections**.
- [ ] **Responsive: 768px+ tablet** — especially for POS terminal use.
- [ ] **Dark/light mode: CSS variables only** — audit for any hardcoded colors.
- [ ] **Toast notifications** — ensure all CUD actions show descriptive toasts (title + description).

---

## 10. DEPLOYMENT & PACKAGING

### 10.1 Windows Services (ENHANCEMENT)
- [~] **NSSM service definitions** — `install-services.ps1` exists but needs: Redis service, Celery worker service, Celery beat service, umbrella service.
- [ ] **`start-all.ps1` / `stop-all.ps1`** — manage all services.
- [ ] **`upgrade.ps1`** — in-place upgrade script (stop → swap → migrate → restart).

### 10.2 Installer (NEW)
- [ ] **Inno Setup / WiX installer** — single .exe/.msi that bundles Python + Node runtimes, installs MongoDB as replica set, creates DB + indexes + seed, registers all services, creates kiosk shortcut, writes `.env`.
- [ ] **Uninstaller** — stops + removes services, optionally preserves database.
- [ ] **Kiosk desktop shortcut** — full-screen browser to `http://127.0.0.1:3000`.
- [ ] **Bundled runtimes** — embeddable Python + portable Node (no separate installs).

### 10.3 Standalone Build
- [ ] **Next.js `output: 'standalone'`** — configure for production Windows deployment.
- [ ] **Structured logging** — `structlog` to rotating files under install directory.
- [ ] **`README-DEPLOYMENT.md`** — step-by-step branch install, HQ install, backup/restore, troubleshooting.

---

## 11. SEED DATA (ENHANCEMENT)

- [ ] **Expand `seed_data.py`** — v5 requires comprehensive seed data including:
  - Chain + 2 chain contacts
  - 3 branches with contacts + BranchSettings (incl. HR rates, master lists)
  - Full role spectrum users (CHAIN_ADMIN, CHAIN_MANAGER, per-branch BRANCH_MANAGER + PHARMACIST + CASHIER)
  - 5 SKUs, 6 StockLocations/branch, 4 Brands (with return_expiry_before), 10 Generics
  - Category tree (Medicines→sub, Groceries→sub, Cosmetics, Veterinary)
  - 30 Products with SKU mappings
  - 3 Suppliers with contacts, channels, channel contacts, promotions, product mappings
  - Rep visits → POs (mix of statuses) with promotion snapshots
  - Purchase invoices with free_qty and discounts
  - Supplier payments with allocations, purchase credit notes
  - Customers with patient links, sale orders (all types), sale invoices with prescriptions
  - Customer payments (split + combined examples), sale credit notes
  - HR: staff with qualifications/documents/allowances/deductions, attendance, payroll runs
  - Accounts: chart of accounts, ledgers, cash registries/sessions, POS terminals/settlements, bank accounts, cheque books, expenses, fund transfers, auto-posted journal entries
  - Backup config + sample record
  - All data must produce a balanced Trial Balance and non-empty Balance Sheet

---

## 12. FRONTEND DEPENDENCIES TO ADD

- [ ] `zustand` — global state management
- [ ] `@tanstack/react-query` — server state
- [ ] `recharts` — charts/analytics
- [ ] `papaparse` — CSV parsing
- [ ] `xlsx` (SheetJS) — Excel export
- [ ] `@react-pdf/renderer` — PDF generation
- [ ] `react-to-print` — print components
- [ ] `date-fns` — date formatting (if not already using)

---

## PRIORITY SUGGESTIONS

### Phase 1 — Foundation
1. Backend architecture refactor (Beanie ODM, UUID, Decimal128, module structure)
2. Chain + Branch enhancements (BranchSettings, BranchContact)
3. Shared frontend components (FormattedInput, PhoneInput, DataTable refactor, FilterPanel, ExportMenu, BulkActionsBar)
4. Role rename + permissions matrix
5. Frontend state management (Zustand + TanStack Query)

### Phase 2 — Core Business
6. Product module restructure (SKU mappings, category tree, generics enhancement)
7. Supplier module full build (channels, promotions, product mappings, rep visits)
8. Purchase flow (PO with promotions → PI with receive + cost calc → inventory batches)
9. Sale flow (SO with reservations → SI with FIFO + free qty → customer payments)
10. Prescription dispensing (4-option suggestions, PrescribedItemMapping, drug labels)

### Phase 3 — Financial
11. Account module (Chart of Accounts, Ledger, JournalEntry engine, auto-posting)
12. Cash registry sessions + POS settlements
13. Expenses with approval + cheques lifecycle
14. Financial statements (Trial Balance, Balance Sheet)
15. Credit notes (purchase + sale) with full lifecycle

### Phase 4 — Operations
16. HR enhancements (qualifications, documents, allowances, deductions, payroll calc engine)
17. Reports expansion
18. Notifications (Celery tasks)
19. Terminal pages (Sale POS, Sale Order, Purchase GRN, Order Terminal)
20. Print/PDF components

### Phase 5 — Infrastructure
21. Redis + Celery integration
22. Sync module
23. Backup & Restore module
24. Windows installer + packaging
25. Comprehensive seed data
