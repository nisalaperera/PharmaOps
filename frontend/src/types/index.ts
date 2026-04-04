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

export type GRNStatus = "PENDING" | "COMPLETED" | "PARTIAL";

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
  id: string;
  name: string;
  description?: string;
}

export interface ProductGeneric {
  id: string;
  name: string;
  description?: string;
}

export interface ProductBrand {
  id: string;
  name: string;
  manufacturerName?: string;
}

export interface ProductUnit {
  id: string;
  name: string;
  abbreviation: string;
}

export interface DrugInteraction {
  productId: string;
  productName: string;
  severity: "MILD" | "MODERATE" | "SEVERE";
  description: string;
}

export interface Product {
  id: string;
  name: string;
  genericId: string;
  genericName: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  unitId: string;
  unitName: string;
  barcode?: string;
  sku: string;
  requiresPrescription: boolean;
  interactions: DrugInteraction[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryBatch {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  supplierId: string;
  supplierName: string;
  receivedDate: string;
}

export interface Inventory {
  id: string;
  branchId: string;
  productId: string;
  productName: string;
  batches: InventoryBatch[];
  totalQuantity: number;
  minStockLevel: number;
  isLowStock: boolean;
  updatedAt: string;
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export interface SupplierChannel {
  id: string;
  channelName: string;
  contactPersonName: string;
  phone: string;
  email: string;
  address?: string;
}

export interface ExpiryAlertConfig {
  daysBeforeExpiry: number;
  brandId?: string;
  brandName?: string;
}

export interface Supplier {
  id: string;
  name: string;
  registrationNumber?: string;
  channels: SupplierChannel[];
  expiryAlertConfigs: ExpiryAlertConfig[];
  creditTermDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Purchase Order ───────────────────────────────────────────────────────────

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PurchaseOrder {
  id: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  channelId: string;
  channelName: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  status: PurchaseOrderStatus;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GRNItem {
  productId: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  batchNumber: string;
  expiryDate: string;
  unitPrice: number;
}

export interface GoodsReceivedNote {
  id: string;
  purchaseOrderId: string;
  branchId: string;
  supplierId: string;
  channelId: string;
  items: GRNItem[];
  status: GRNStatus;
  receivedBy: string;
  receivedAt: string;
  notes?: string;
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

export interface Doctor {
  id: string;
  name: string;
  specialization: string;
  hospitalOrClinic: string;
  licenseNumber: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Patient / Customer ───────────────────────────────────────────────────────

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth?: string;
}

export interface Patient {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  familyMembers: FamilyMember[];
  creditLimit: number;
  outstandingBalance: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Prescription ─────────────────────────────────────────────────────────────

export interface PrescriptionItem {
  productId: string;
  productName: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  branchId: string;
  items: PrescriptionItem[];
  prescriptionDate: string;
  expiryDate: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

// ─── Sale / POS ───────────────────────────────────────────────────────────────

export interface SaleItem {
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  prescriptionId?: string;
}

export interface Sale {
  id: string;
  branchId: string;
  patientId?: string;
  patientName?: string;
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  chequeDetails?: {
    chequeNumber: string;
    bankName: string;
    clearanceDate: string;
    status: ChequeStatus;
  };
  paidAmount: number;
  changeAmount: number;
  status: SaleStatus;
  cashierId: string;
  cashierName: string;
  createdAt: string;
}

// ─── Stock Transfer ───────────────────────────────────────────────────────────

export interface StockTransferItem {
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  sourceBranchId: string;
  sourceBranchName: string;
  destinationBranchId: string;
  destinationBranchName: string;
  items: StockTransferItem[];
  status: TransferStatus;
  initiatedBy: string;
  confirmedBy?: string;
  confirmedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Staff & Attendance ───────────────────────────────────────────────────────

export type EmploymentType = "SALARIED" | "HOURLY";

export interface Staff {
  id: string;
  branchId: string;
  fullName: string;
  phone: string;
  email?: string;
  role: string;
  employmentType: EmploymentType;
  baseSalary?: number;
  hourlyRate?: number;
  shiftType: ShiftType;
  joinDate: string;
  isActive: boolean;
  createdAt: string;
}

export interface Attendance {
  id: string;
  staffId: string;
  staffName: string;
  branchId: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  shiftType: ShiftType;
  status: AttendanceStatus;
  overtimeHours: number;
  notes?: string;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export interface PayrollDeduction {
  type: "TAX" | "EPF" | "ETF" | "LOAN" | "OTHER";
  description?: string;
  amount: number;
}

export interface Payroll {
  id: string;
  staffId: string;
  staffName: string;
  branchId: string;
  month: number;
  year: number;
  basicSalary: number;
  overtimePay: number;
  grossSalary: number;
  deductions: PayrollDeduction[];
  totalDeductions: number;
  netSalary: number;
  isPaid: boolean;
  paidAt?: string;
  paidBy?: string;
  createdAt: string;
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
