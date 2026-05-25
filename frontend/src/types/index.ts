// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "BRANCH_ADMIN"
  | "BRANCH_MANAGER"
  | "BRANCH_USER";

export type UserStatus = "ACTIVE" | "INACTIVE";

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "CREDIT" | "CHEQUE";

export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "PARTIAL"
  | "RECEIVED"
  | "CANCELLED";

export type GRNStatus                     = "PENDING" | "COMPLETED" | "PARTIAL";
export type PurchaseInvoiceStatus         = "PENDING" | "COMPLETED" | "PARTIAL";
export type PurchaseInvoicePaymentStatus  = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type SalesOrderStatus              = "DRAFT" | "CONFIRMED" | "INVOICED" | "CANCELLED";
export type SaleSource                    = "POS" | "ORDER";

export type SaleStatus = "COMPLETED" | "REFUNDED" | "PARTIAL_REFUND";

export type ChequeStatus = "PENDING" | "CLEARED" | "BOUNCED";

export type TransferStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY";

export type ShiftType = "MORNING" | "EVENING" | "FULL_DAY";

export type NotificationType =
  | "LOW_STOCK"
  | "EXPIRY_ALERT"
  | "PO_APPROVAL"
  | "TRANSFER_REQUEST"
  | "PAYMENT_DUE"
  | "SYSTEM";

export type ReportType =
  | "SALES_SUMMARY"
  | "STOCK_VALUATION"
  | "EXPIRY_REPORT"
  | "STAFF_ATTENDANCE"
  | "PURCHASE_HISTORY";

// ─── User & Auth ─────────────────────────────────────────────────────────────

export type ThemeOption = "light" | "dark" | "system";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  status: UserStatus;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  created_by_id?:   string;
  created_by_name?: string;
  updated_by_id?:   string;
  updated_by_name?: string;
}

export interface UserPreferences {
  user_id: string;
  theme: ThemeOption;
}

// ─── Branch ───────────────────────────────────────────────────────────────────

export interface BranchOperatingHours {
  day: string;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  license_number: string;
  assigned_pharmacist_id: string | null;
  assigned_staff_ids: string[];
  operating_hours: BranchOperatingHours[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_id?:   string;
  created_by_name?: string;
  updated_by_id?:   string;
  updated_by_name?: string;
}

// ─── Product Catalog ──────────────────────────────────────────────────────────

export interface ProductCategory {
  id:           string;
  name:         string;
  description?: string;
  parent_id?:   string | null;
  parent_name?: string | null;
  is_active:    boolean;
}

export interface ProductGeneric {
  id:           string;
  name:         string;
  description?: string;
  is_active:    boolean;
}

export interface ProductBrand {
  id:                string;
  name:              string;
  manufacturer_name?: string;
  description?:      string | null;
  is_active:         boolean;
}

export type SkuType = "COUNT" | "VOLUME" | "WEIGHT" | "LENGTH";

export interface ProductSku {
  id:        string;
  name:      string;
  plural?:   string | null;
  sku_type:  SkuType;
  is_active: boolean;
}

export interface SkuMapping {
  sku:              string;
  mapped_sku:       string;
  mapped_sku_count: number;
  basic_sku_count:  number;
}

export interface Product {
  id:                     string;
  name:                   string;
  generic_id:             string;
  generic_name:           string;
  brand_id:               string;
  brand_name:             string;
  category_id:            string;
  category_name:          string;
  basic_sku_id:           string;
  basic_sku_name:         string;
  barcode?:               string;
  specific_instructions?: string | null;
  sku_mappings:           SkuMapping[];
  is_active:                boolean;
  created_at:               string;
  last_modified_at:         string;
  created_by_id?:           string;
  created_by_name?:         string;
  last_modified_by_id?:     string;
  last_modified_by_name?:   string;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryBatch {
  batch_number:   string;
  expiry_date:    string;
  quantity:       number;
  purchase_price: number;
  selling_price:  number;
  supplier_id:    string;
  supplier_name:  string;
  received_date:  string;
}

export interface InventoryItem {
  id:              string;
  branch_id:       string;
  product_id:      string;
  product_name:    string;
  batches:         InventoryBatch[];
  total_quantity:  number;
  min_stock_level: number;
  is_low_stock:    boolean;
  created_at?:     string;
  updated_at?:     string;
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export type SupplierType      = "AGENCY" | "DISTRIBUTOR";
export type ChannelCategory   = "AGENCY" | "SUB";
export type ContactType       = "SALES" | "DELIVERY";
export type ContactTitle      = "Mr." | "Mrs." | "Ms." | "Dr." | "Prof.";
export type DeliveryFrequency = "DAILY" | "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "AS_NEEDED";

export interface ChannelContact {
  id?:          string;
  title:        ContactTitle;
  first_name:   string;
  last_name:    string;
  landline?:    string;
  mobile:       string;
  whatsapp?:    string;
  contact_type: ContactType;
}

export interface ChannelProductMapping {
  product_id:   string;
  product_name: string;
}

export interface AgencyChannel {
  id?:              string;
  channel_name:     string;
  contacts:         ChannelContact[];
  product_mappings: ChannelProductMapping[];
}

export interface DistributorChannel {
  id?:                string;
  channel_name:       string;
  channel_category:   ChannelCategory;
  agency_id?:         string;
  agency_name?:       string;
  credit_term_days:   number;
  delivery_frequency: DeliveryFrequency;
  contacts:           ChannelContact[];
  product_mappings:   ChannelProductMapping[];
}

export interface ExpiryAlertConfig {
  days_before_expiry: number;
  brand_id?:          string;
  brand_name?:        string;
}

export interface Supplier {
  id:                   string;
  supplier_type:        SupplierType;
  short_name:           string;
  legal_name:           string;
  registration_number?: string;
  agency_channels:      AgencyChannel[];
  distributor_channels: DistributorChannel[];
  expiry_alert_configs: ExpiryAlertConfig[];
  is_active:            boolean;
  created_at?:          string;
  updated_at?:          string;
}

export interface SupplierAgencyOption {
  id:         string;
  short_name: string;
}

// ─── Purchase Order ───────────────────────────────────────────────────────────

export interface PurchaseOrderItem {
  product_id:   string;
  product_name: string;
  quantity:     number;
  unit_price:   number;
  total_price:  number;
}

export interface PurchaseOrder {
  id:               string;
  branch_id:        string;
  supplier_id:      string;
  supplier_name:    string;
  channel_id:       string;
  channel_name:     string;
  credit_term_days: number;
  items:            PurchaseOrderItem[];
  total_amount:     number;
  status:           PurchaseOrderStatus;
  created_by:       string;
  approved_by?:     string;
  approved_at?:     string;
  notes?:           string;
  created_at:       string;
  updated_at:       string;
}

export interface GRNItem {
  product_id:        string;
  product_name:      string;
  ordered_quantity:  number;
  received_quantity: number;
  batch_number:      string;
  expiry_date:       string;
  unit_price:        number;
}

export interface GoodsReceivedNote {
  id:                string;
  purchase_order_id: string;
  branch_id:         string;
  supplier_id:       string;
  supplier_name:     string;
  channel_id:        string;
  channel_name:      string;
  items:             GRNItem[];
  status:            GRNStatus;
  received_by:       string;
  received_at:       string;
  notes?:            string;
  created_at:        string;
  updated_at:        string;
}

export interface PaymentEntry {
  amount:         number;
  payment_date:   string;
  payment_method: "CASH" | "CARD" | "BANK_TRANSFER" | "CHEQUE";
}

export interface PurchaseInvoice {
  id:                   string;
  purchase_order_id:    string;
  branch_id:            string;
  supplier_id:          string;
  supplier_name:        string;
  channel_id:           string;
  channel_name:         string;
  items:                GRNItem[];
  invoice_number:       string;
  invoice_date:         string;
  supplier_invoice_ref?: string;
  status:               PurchaseInvoiceStatus;
  payment_status:       PurchaseInvoicePaymentStatus;
  payment_entries:      PaymentEntry[];
  received_by:          string;
  received_at:          string;
  notes?:               string;
  created_at:           string;
  updated_at:           string;
}

// ─── Sales Order ──────────────────────────────────────────────────────────────

export interface SalesOrderItem {
  product_id:      string;
  product_name:    string;
  quantity:        number;
  unit_price:      number;
  discount:        number;
  total_price:     number;
  prescription_id?: string;
}

export interface SalesOrder {
  id:              string;
  branch_id:       string;
  customer_id?:    string;
  customer_name?:  string;
  items:           SalesOrderItem[];
  subtotal:        number;
  discount_total:  number;
  total_amount:    number;
  status:          SalesOrderStatus;
  created_by:      string;
  created_by_name: string;
  confirmed_at?:   string;
  invoiced_at?:    string;
  cancelled_at?:   string;
  sale_id?:        string;
  notes?:          string;
  created_at:      string;
  updated_at:      string;
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  hospital_or_clinic: string;
  license_number: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface Customer {
  id:                  string;
  full_name:           string;
  phone:               string;
  email?:              string;
  date_of_birth?:      string;
  address?:            string;
  credit_limit:        number;
  outstanding_balance: number;
  is_active:           boolean;
  created_at:          string;
  updated_at:          string;
  created_by_id?:      string;
  created_by_name?:    string;
  updated_by_id?:      string;
  updated_by_name?:    string;
}

// ─── Patient (prescription profile linked to a Customer) ─────────────────────

export type PatientRelationship = "SELF" | "SPOUSE" | "CHILD" | "PARENT" | "SIBLING" | "OTHER";

export interface Patient {
  id:            string;
  customer_id:   string;
  customer_name: string;
  name:          string;
  relationship:  PatientRelationship;
  date_of_birth?: string;
  is_active:     boolean;
  created_at:    string;
  updated_at:    string;
}

// ─── Prescription ─────────────────────────────────────────────────────────────

export interface PrescriptionItem {
  product_id: string;
  product_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
}

export interface Prescription {
  id: string;
  patient_id: string;
  patient_name: string;
  doctor_id: string;
  doctor_name: string;
  branch_id: string;
  items: PrescriptionItem[];
  prescription_date: string;
  expiry_date: string;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at?: string;
}

// ─── Sale / POS ───────────────────────────────────────────────────────────────

export interface ChequeDetails {
  cheque_number:  string;
  bank_name:      string;
  clearance_date: string;
  status:         ChequeStatus;
}

export interface SaleItem {
  product_id:      string;
  product_name:    string;
  batch_number:    string;
  quantity:        number;
  unit_price:      number;
  discount:        number;
  total_price:     number;
  prescription_id?: string;
}

export interface Sale {
  id:               string;
  branch_id:        string;
  customer_id?:     string;
  customer_name?:   string;
  items:            SaleItem[];
  subtotal:         number;
  discount_total:   number;
  total_amount:     number;
  refund_amount?:   number;
  payment_method:   PaymentMethod;
  cheque_details?:  ChequeDetails;
  paid_amount:      number;
  change_amount:    number;
  status:           SaleStatus;
  source:           SaleSource;
  sales_order_id?:  string;
  cashier_id:       string;
  cashier_name:     string;
  created_at:       string;
  updated_at?:      string;
}

// ─── Credit Payment ───────────────────────────────────────────────────────────

export type CreditPaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "CHEQUE";

export interface CreditPayment {
  id:              string;
  customer_id:     string;
  customer_name:   string;
  sale_id?:        string;
  amount:          number;
  payment_method:  CreditPaymentMethod;
  notes?:          string;
  branch_id:       string;
  cashier_id:      string;
  cashier_name:    string;
  created_at:      string;
  updated_at:      string;
}

// ─── Stock Transfer ───────────────────────────────────────────────────────────

export interface StockTransferItem {
  product_id:   string;
  product_name: string;
  batch_number: string;
  quantity:     number;
}

export interface StockTransfer {
  id:                      string;
  source_branch_id:        string;
  source_branch_name:      string;
  destination_branch_id:   string;
  destination_branch_name: string;
  items:                   StockTransferItem[];
  status:                  TransferStatus;
  initiated_by:            string;
  confirmed_by?:           string | null;
  confirmed_at?:           string | null;
  notes?:                  string | null;
  created_at:              string;
  updated_at:              string;
}

// ─── Staff & Attendance ───────────────────────────────────────────────────────

export type EmploymentType = "SALARIED" | "HOURLY";

export interface Staff {
  id: string;
  branch_id: string;
  title?: string;
  first_name: string;
  last_name: string;
  mobile_1: string;
  mobile_2?: string;
  landline?: string;
  whatsapp_number?: string;
  email?: string;
  epf_no?: string;
  id_number?: string;
  address?: string;
  role: string;
  employment_type?: EmploymentType;
  base_salary?: number;
  hourly_rate?: number;
  shift_type?: ShiftType;
  join_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_id?:   string;
  created_by_name?: string;
  updated_by_id?:   string;
  updated_by_name?: string;
}

export interface Attendance {
  id: string;
  staff_id: string;
  staff_name: string;
  branch_id: string;
  date: string;
  clock_in?: string;
  clock_out?: string;
  shift_type: ShiftType;
  status: AttendanceStatus;
  overtime_hours: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  created_by_id?:   string;
  created_by_name?: string;
  updated_by_id?:   string;
  updated_by_name?: string;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export type DeductionType = "TAX" | "EPF" | "ETF" | "LOAN" | "OTHER";

export interface PayrollDeduction {
  type:         DeductionType;
  description?: string;
  amount:       number;
}

export interface Payroll {
  id:               string;
  staff_id:         string;
  staff_name:       string;
  branch_id:        string;
  month:            number;
  year:             number;
  deductions:       PayrollDeduction[];
  basic_salary:     number;
  overtime_pay:     number;
  gross_salary:     number;
  total_deductions: number;
  net_salary:       number;
  is_paid:          boolean;
  paid_at?:         string;
  paid_by?:         string;
  created_at:       string;
  updated_at:       string;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  branchId?: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userRole: UserRole;
  branchId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface SalesSummaryReport {
  total_amount:   number;
  sale_count:     number;
  payment_totals: Record<string, number>;
}

export interface StockValuationItem {
  product_id:   string;
  product_name: string;
  branch_id:    string;
  total_qty:    number;
  value:        number;
}

export interface StockValuationReport {
  total_value:    number;
  item_count:     number;
  low_stock_count: number;
  items:          StockValuationItem[];
}

export interface ExpiryItem {
  product_name: string;
  branch_id:    string;
  batch_number: string;
  expiry_date:  string;
  quantity:     number;
}

export interface ExpiryReport {
  expiring_count: number;
  expiring_items: ExpiryItem[];
}

// ─── Treasury ─────────────────────────────────────────────────────────────────

export type ChequeIssueStatus = "ISSUED" | "CLEARED" | "BOUNCED" | "CANCELLED";

export type RegistryTransactionType =
  | "OPENING"
  | "CLOSING"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export type FundSourceType = "CASH_REGISTRY" | "BANK_ACCOUNT";

export interface CashRegistry {
  id:                       string;
  name:                     string;
  branch_id:                string;
  branch_name:              string;
  responsible_staff_id?:    string;
  responsible_staff_name?:  string;
  current_balance:          number;
  is_open:                  boolean;
  is_active:                boolean;
  created_at:               string;
  updated_at:               string;
  created_by_id?:           string;
  created_by_name?:         string;
  updated_by_id?:           string;
  updated_by_name?:         string;
}

export interface CashRegistryTransaction {
  id:              string;
  registry_id:     string;
  registry_name:   string;
  branch_id:       string;
  type:            RegistryTransactionType;
  amount:          number;
  balance_before:  number;
  balance_after:   number;
  physical_count?: number;
  discrepancy?:    number;
  notes?:          string;
  reference_id?:   string;
  created_at:      string;
  created_by_id?:  string;
  created_by_name?: string;
}

export interface BankAccount {
  id:              string;
  bank_name:       string;
  account_number:  string;
  account_name:    string;
  branch_id:       string;
  branch_name:     string;
  current_balance: number;
  is_active:       boolean;
  created_at:      string;
  updated_at:      string;
  created_by_id?:  string;
  created_by_name?: string;
  updated_by_id?:  string;
  updated_by_name?: string;
}

export interface BankAccountTransaction {
  id:              string;
  account_id:      string;
  account_name:    string;
  branch_id:       string;
  type:            string;
  amount:          number;
  balance_before:  number;
  balance_after:   number;
  notes?:          string;
  reference_id?:   string;
  created_at:      string;
  created_by_id?:  string;
  created_by_name?: string;
}

export interface FundTransfer {
  id:               string;
  from_source_type: FundSourceType;
  from_source_id:   string;
  from_source_name: string;
  to_source_type:   FundSourceType;
  to_source_id:     string;
  to_source_name:   string;
  amount:           number;
  notes?:           string;
  transfer_date:    string;
  branch_id:        string;
  created_at:       string;
  created_by_id?:   string;
  created_by_name?: string;
}

// ─── Cheque Books ─────────────────────────────────────────────────────────────

export interface ChequeBook {
  id:                string;
  bank_account_id:   string;
  bank_account_name: string;
  bank_name:         string;
  branch_id:         string;
  branch_name:       string;
  series_name:       string;
  start_number:      number;
  end_number:        number;
  total_leaves:      number;
  used_leaves:       number;
  is_active:         boolean;
  notes?:            string;
  created_at:        string;
  updated_at:        string;
  created_by_id?:    string;
  created_by_name?:  string;
  updated_by_id?:    string;
  updated_by_name?:  string;
}

export interface ChequeIssue {
  id:                 string;
  cheque_book_id:     string;
  bank_account_id:    string;
  cheque_number:      number;
  payee:              string;
  amount:             number;
  issue_date:         string;
  purpose?:           string;
  status:             ChequeIssueStatus;
  status_updated_at?: string;
  notes?:             string;
  created_at:         string;
  updated_at:         string;
  created_by_id?:     string;
  created_by_name?:   string;
}

// ─── POS Machines ────────────────────────────────────────────────────────────

export type PosCardType = "VISA" | "MASTERCARD" | "AMEX" | "OTHER";

export interface PosMachine {
  id:                string;
  bank_account_id:   string;
  bank_account_name: string;
  bank_name:         string;
  branch_id:         string;
  branch_name:       string;
  terminal_id:       string;
  merchant_id?:      string;
  unsettled_amount:  number;
  last_settled_at?:  string;
  is_active:         boolean;
  notes?:            string;
  created_at:        string;
  updated_at:        string;
  created_by_id?:    string;
  created_by_name?:  string;
  updated_by_id?:    string;
  updated_by_name?:  string;
}

export interface PosTransaction {
  id:               string;
  pos_machine_id:   string;
  bank_account_id:  string;
  branch_id:        string;
  amount:           number;
  card_type:        PosCardType;
  reference_number?: string;
  transaction_date: string;
  is_settled:       boolean;
  settlement_id?:   string;
  notes?:           string;
  created_at:       string;
  created_by_id?:   string;
  created_by_name?: string;
}

export interface PosSettlement {
  id:                string;
  pos_machine_id:    string;
  bank_account_id:   string;
  bank_account_name: string;
  branch_id:         string;
  total_amount:      number;
  transaction_count: number;
  settlement_date:   string;
  notes?:            string;
  created_at:        string;
  created_by_id?:    string;
  created_by_name?:  string;
}

// ─── Pagination & API ────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  details?: unknown;
}

export interface ImportResultError {
  row: number;
  message: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: ImportResultError[];
}

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface BranchSummary {
  branchId: string;
  branchName: string;
  todaySales: number;
  monthSales: number;
  lowStockCount: number;
  expiringCount: number;
  pendingPOs: number;
}

export interface DashboardStats {
  totalBranches: number;
  totalSalesToday: number;
  totalSalesMonth: number;
  totalLowStock: number;
  totalExpiring: number;
  totalPendingPOs: number;
  branchSummaries: BranchSummary[];
}
