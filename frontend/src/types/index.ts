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
export type PurchaseInvoiceStatus         = "DRAFT" | "RECEIVED" | "VERIFIED";
export type PurchaseInvoicePaymentStatus  = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type PurchasePaymentMethod         = "CASH" | "CHEQUE" | "BANK_TRANSFER";
export type SalesOrderStatus              = "DRAFT" | "CONFIRMED" | "INVOICED" | "CANCELLED";
export type SaleSource                    = "POS" | "ORDER";

export type SaleStatus = "COMPLETED" | "REFUNDED" | "PARTIAL_REFUND";

export type ChequeStatus = "PENDING" | "CLEARED" | "BOUNCED";

export type TransferStatus = "PENDING" | "IN_TRANSIT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "REJECTED" | "CANCELLED";

export type StockMovementLogType = "STOCK_IN" | "STOCK_OUT" | "TRANSFER_IN" | "TRANSFER_OUT" | "PURCHASE" | "SALE";

export type StockMovementType   = "STOCK_IN" | "STOCK_OUT";
export type StockMovementStatus = "CREATED" | "PARTIALLY_COMPLETED" | "COMPLETED";

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
  updated_by_id?:   string;
}

export interface UserPreferences {
  user_id: string;
  theme: ThemeOption;
}

// ─── Chain & Shared Types ─────────────────────────────────────────────────────

export type CurrencyCode = "LKR" | "USD" | "EUR" | "GBP" | "INR";

export type EntityContactTitle = "Mr." | "Mrs." | "Ms." | "Dr." | "Prof.";

export interface EntityContact {
  id?:        string;
  identifier: string;
  title:      EntityContactTitle;
  first_name: string;
  last_name:  string;
  mobile_1:   string;
  mobile_2?:  string;
  whatsapp?:  string;
  landline?:  string;
  email?:     string;
  is_active:  boolean;
}

export interface PayeTaxSlab {
  min_amount:   number;
  max_amount:   number | null;
  rate_percent: number;
  fixed_amount: number;
}

export interface ChainSettings {
  default_currency:       CurrencyCode;
  low_stock_threshold:    number;
  expiry_alert_days:      number;
  loyalty_points_rate?:   number | null;
  tax_enabled:            boolean;
  is_discount_applicable: boolean;
  invoice_footer_text?:   string | null;
  storage_conditions:     string[];
  special_instructions:   string[];
  dosage_instructions:    string[];
}

export interface ChainHRParams {
  standard_daily_hours:   number;
  working_days_per_month: number;
  ot_rate_multiplier:     number;
  epf_employee_rate:      number;
  epf_employer_rate:      number;
  etf_employer_rate:      number;
  paye_tax_slabs:         PayeTaxSlab[];
}

export interface Chain {
  id:           string;
  name:         string;
  logo?:        string | null;
  chain_prefix: string;
  contacts:     EntityContact[];
  settings:     ChainSettings;
  hr_params:    ChainHRParams;
  created_at?:  string;
  updated_at?:  string;
  created_by_id?:   string;
  updated_by_id?:   string;
}

// ─── Branch ───────────────────────────────────────────────────────────────────

export interface BranchOperatingHours {
  day: string;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface BranchSettings {
  currency?:              CurrencyCode | null;
  logo?:                  string | null;
  low_stock_threshold?:   number | null;
  expiry_alert_days?:     number | null;
  loyalty_points_rate?:   number | null;
  tax_enabled?:           boolean | null;
  is_discount_applicable?: boolean | null;
  invoice_footer_text?:   string | null;
  storage_conditions?:    string[] | null;
  special_instructions?:  string[] | null;
  dosage_instructions?:   string[] | null;
}

export interface BranchHRParams {
  standard_daily_hours?:   number | null;
  working_days_per_month?: number | null;
  ot_rate_multiplier?:     number | null;
  epf_employee_rate?:      number | null;
  epf_employer_rate?:      number | null;
  etf_employer_rate?:      number | null;
  paye_tax_slabs?:         PayeTaxSlab[] | null;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  license_number: string;
  branch_prefix?: string | null;
  chain_id?: string | null;
  branch_manager?: string | null;
  assigned_staff_ids: string[];
  contacts: EntityContact[];
  operating_hours: BranchOperatingHours[];
  settings?: BranchSettings | null;
  hr_params?: BranchHRParams | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  phone?: string;
  assigned_pharmacist_id?: string | null;
  created_by_id?:   string;
  updated_by_id?:   string;
}

// ─── Stock Locations ──────────────────────────────────────────────────────────

export interface StockLocation {
  id:           string;
  branch_id:    string;
  name:         string;
  code:         string;
  description?: string | null;
  is_active:    boolean;
  created_at?:  string;
  updated_at?:  string;
  created_by_id?:   string;
  updated_by_id?:   string;
}

// ─── Product Catalog ──────────────────────────────────────────────────────────

export interface ProductCategory {
  id:                            string;
  name:                          string;
  parent_id?:                    string | null;
  parent_name?:                  string | null;
  is_discount_applicable:        boolean;
  default_margin_percentage?:    number | null;
  effective_margin_percentage?:  number | null;
  icon?:                         string | null;
  colour?:                       string | null;
  level?:                        number;
  path?:                         string;
  is_active:                     boolean;
  created_at?:                   string;
  updated_at?:                   string;
  created_by_id?:                string;
  updated_by_id?:                string;
}

export type DosageForm =
  | "TABLET" | "CAPSULE" | "SYRUP" | "INJECTION" | "CREAM" | "OINTMENT"
  | "DROPS" | "INHALER" | "SUPPOSITORY" | "PATCH" | "POWDER" | "SOLUTION"
  | "SUSPENSION" | "GEL" | "SPRAY" | "LOZENGE" | "OTHER";

export type ControlledSchedule =
  | "NONE" | "SCHEDULE_I" | "SCHEDULE_II" | "SCHEDULE_III" | "SCHEDULE_IV" | "SCHEDULE_V";

export interface ProductGeneric {
  id:                             string;
  name:                           string;
  description?:                   string | null;
  dosage_form?:                   DosageForm | null;
  requires_prescription:          boolean;
  controlled_substance_schedule?: ControlledSchedule | null;
  active_ingredients:             string[];
  side_effects:                   string[];
  drug_interactions:              string[];
  local_license_number?:          string | null;
  storage_conditions:             string[];
  special_instructions:           string[];
  dosage_instructions:            string[];
  stock_location_id?:             string | null;
  stock_location_name?:           string | null;
  is_active:                      boolean;
  created_at?:                    string;
  updated_at?:                    string;
  created_by_id?:                 string;
  updated_by_id?:                 string;
}

export interface ProductBrand {
  id:                    string;
  name:                  string;
  manufacturer_name?:    string;
  country?:              string | null;
  return_expiry_before?: number | null;
  is_active:             boolean;
  created_at?:           string;
  updated_at?:           string;
  created_by_id?:        string;
  updated_by_id?:        string;
}

export type SkuType = "COUNT" | "VOLUME" | "WEIGHT" | "LENGTH";

export interface ProductSku {
  id:        string;
  name:      string;
  plural?:   string | null;
  sku_type:  SkuType;
  is_active: boolean;
  created_at?:      string;
  updated_at?:      string;
  created_by_id?:   string;
  updated_by_id?:   string;
}

export interface SkuMapping {
  sku:              string;
  mapped_sku:       string;
  mapped_sku_count: number;
  basic_sku_count:  number;
}

export interface Product {
  id:                      string;
  name:                    string;
  generic_id?:             string | null;
  generic_name:            string;
  brand_id?:               string | null;
  brand_name:              string;
  category_id:             string;
  category_name:           string;
  basic_sku_id:            string;
  basic_sku_name:          string;
  barcode?:                string;
  description?:            string | null;
  image?:                  string | null;
  specific_instructions?:  string | null;
  is_discount_applicable:  boolean;
  reorder_level:           number;
  sku_mappings:            SkuMapping[];
  is_active:               boolean;
  created_at?:             string;
  updated_at?:             string;
  created_by_id?:          string;
  updated_by_id?:          string;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryBatch {
  batch_number:             string;
  expiry_date:              string;
  quantity:                 number;
  received_quantity?:       number;
  basic_sku?:               string | null;
  basic_sku_quantity:       number;
  basic_sku_selling_price:  number;
  basic_sku_purchase_price: number;
  manufacture_date?:        string | null;
  channel_id?:              string | null;
  purchase_invoice_id?:     string | null;
}

export interface StockMovementLog {
  id:                       string;
  branch_id:                string;
  product_id:               string;
  product_name:             string;
  batch_number:             string;
  expiry_date?:             string | null;
  sku?:                     string | null;
  quantity:                 number;
  purchase_price?:          number | null;
  selling_price?:           number | null;
  basic_sku?:               string | null;
  basic_sku_count?:         number | null;
  basic_sku_quantity?:      number | null;
  basic_sku_selling_price?: number | null;
  basic_sku_purchase_price?: number | null;
  stock_location_id?:       string | null;
  movement_type:            StockMovementLogType;
  reason?:                  string | null;
  notes?:                   string | null;
  reference_id?:            string | null;
  reference_type?:          string | null;
  created_at?:              string;
}

export interface LocationSuggestion {
  stock_location_id:   string;
  stock_location_name: string;
  is_new:              boolean;
}

export interface InventoryItem {
  id:                       string;
  branch_id:                string;
  product_id:               string;
  product_name:             string;
  basic_sku?:               string | null;
  basic_sku_count:          number;
  batches:                  InventoryBatch[];
  basic_sku_total_quantity: number;
  created_at?:              string;
  updated_at?:              string;
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export type SupplierType      = "AGENCY" | "DISTRIBUTOR";
export type ChannelCategory   = "AGENCY" | "SUB";
export type ContactType       = "SALES" | "DELIVERY";
export type ContactTitle      = "Mr." | "Mrs." | "Ms." | "Dr." | "Prof.";
export type DeliveryFrequency = "DAILY" | "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "AS_NEEDED";
export type PromotionType    = "PERCENTAGE" | "BONUS_QUANTITY";

export interface ChannelPromotion {
  id?:               string;
  name:              string;
  promotion_type:    PromotionType;
  discount_percent?: number | null;
  buy_quantity?:     number | null;
  free_quantity?:    number | null;
  is_default:        boolean;
  valid_from?:       string | null;
  valid_to?:         string | null;
  is_active:         boolean;
}

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
  product_id:            string;
  product_name:          string;
  sort_order:            number;
  cost_price?:           number | null;
  pack_sku_id?:          string | null;
  pack_sku_name?:        string | null;
  default_promotion_ids: string[];
}

export interface AgencyChannel {
  id?:              string;
  channel_name:     string;
  contacts:         ChannelContact[];
  entity_contacts:  EntityContact[];
  credit_term_days: number;
  credit_limit?:    number | null;
  promotions:       ChannelPromotion[];
  product_mappings: ChannelProductMapping[];
}

export interface DistributorChannel {
  id?:                string;
  channel_name:       string;
  channel_category:   ChannelCategory;
  agency_id?:         string;
  agency_name?:       string;
  credit_term_days:   number;
  credit_limit?:      number | null;
  delivery_frequency: DeliveryFrequency;
  contacts:           ChannelContact[];
  entity_contacts:    EntityContact[];
  promotions:         ChannelPromotion[];
  product_mappings:   ChannelProductMapping[];
}

export interface ExpiryAlertConfig {
  days_before_expiry: number;
  brand_id?:          string;
  brand_name?:        string;
}

export interface Supplier {
  id:                    string;
  supplier_type:         SupplierType;
  name:                  string;
  legal_name:            string;
  registration_number?:  string;
  contacts:              EntityContact[];
  credit_term_days:      number;
  credit_limit?:         number | null;
  outstanding_balance:   number;
  notes?:                string | null;
  agency_channels:       AgencyChannel[];
  distributor_channels:  DistributorChannel[];
  expiry_alert_configs:  ExpiryAlertConfig[];
  is_active:             boolean;
  short_name?:           string;
  created_at?:           string;
  updated_at?:           string;
  created_by_id?:        string;
  updated_by_id?:        string;
}

export interface SupplierAgencyOption {
  id:   string;
  name: string;
}

// ─── Purchase Credit Notes ────────────────────────────────────────────────────

export type CreditNoteStatus = "DRAFT" | "APPROVED" | "APPLIED" | "CANCELLED";

export interface CreditNoteItem {
  product_id:             string;
  product_name:           string;
  batch_number:           string;
  expiry_date:            string;
  quantity:               number;
  unit_price:             number;
  line_total:             number;
  source_invoice_id?:     string | null;
  return_policy_warning?: string | null;
}

export interface PurchaseCreditNote {
  id:                   string;
  credit_note_number:   string;
  branch_id:            string;
  supplier_id:          string;
  supplier_name:        string;
  channel_id?:          string | null;
  channel_name:         string;
  credit_note_date:     string;
  items:                CreditNoteItem[];
  total_amount:         number;
  status:               CreditNoteStatus;
  applied_payment_id?:  string | null;
  applied_at?:          string | null;
  inventory_deducted:   boolean;
  notes?:               string | null;
  created_at?:          string;
  updated_at?:          string;
  created_by_id?:       string;
}

// ─── Rep Visits ──────────────────────────────────────────────────────────────

export interface RepVisit {
  id:                 string;
  supplier_id:        string;
  supplier_name:      string;
  channel_id:         string;
  channel_name:       string;
  visit_date:         string;
  rep_name:           string;
  rep_contact?:       string | null;
  notes?:             string | null;
  purchase_order_id?: string | null;
  created_at?:        string;
  updated_at?:        string;
  created_by_id?:     string;
  updated_by_id?:     string;
}

// ─── Purchase Order ───────────────────────────────────────────────────────────

export interface PurchaseOrderItem {
  product_id:    string;
  product_name:  string;
  sku:           string;
  unit_quantity: number;
  free_quantity: number;
  discount:      number;
  unit_price:    number;
  line_total:    number;
}

export interface PurchaseOrderReturnItem {
  product_id:    string;
  product_name:  string;
  sku:           string;
  unit_quantity: number;
  free_quantity: number;
  unit_price:    number;
  line_total:    number;
}

export interface PurchaseOrder {
  id:               string;
  order_number:     string;
  order_date:       string;
  branch_id:        string;
  supplier_id:      string;
  supplier_name:    string;
  channel_id:       string;
  channel_name:     string;
  credit_term_days: number;
  items:            PurchaseOrderItem[];
  return_items:     PurchaseOrderReturnItem[];
  total_amount:     number;
  return_amount:    number;
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
  payment_id?:    string;
  amount:         number;
  payment_date:   string;
  payment_method: PurchasePaymentMethod;
  reference?:     string;
}

export interface PurchaseInvoiceItem {
  product_id:    string;
  product_name:  string;
  sku:           string;
  batch_number:  string;
  expiry_date:   string;
  unit_quantity: number;
  free_quantity: number;
  discount:      number;
  unit_price:    number;
  selling_price: number;
  line_total:    number;
}

export interface PurchaseReturnItem {
  product_id:   string;
  product_name: string;
  batch_number: string;
  quantity:     number;
  unit_price:   number;
  line_total:   number;
}

export interface PurchaseInvoice {
  id:                       string;
  invoice_number:           string;
  invoice_date:             string;
  branch_id:                string;
  supplier_id:              string;
  supplier_name:            string;
  channel_id:               string;
  channel_name:             string;
  credit_term_days:         number;
  purchase_order_id?:       string | null;
  distributor_invoice_no?:  string | null;
  distributor_invoice_date?: string | null;
  items:                    PurchaseInvoiceItem[];
  return_items:             PurchaseReturnItem[];
  manual_total_amount?:     number | null;
  manual_return_amount?:    number | null;
  total_amount:             number;
  return_amount:            number;
  net_amount:               number;
  status:                   PurchaseInvoiceStatus;
  payment_status:           PurchaseInvoicePaymentStatus;
  paid_amount:              number;
  payment_entries:          PaymentEntry[];
  verified_by?:             string | null;
  verified_at?:             string | null;
  inventory_posted:         boolean;
  notes?:                   string;
  created_at:               string;
  updated_at:               string;
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
  updated_by_id?:      string;
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
  credit_amount?:         number;
  credit_settled_amount?: number;
  credit_settled?:        boolean;
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

export interface CustomerLedgerEntry {
  entry_type:      "CREDIT_SALE" | "PAYMENT";
  id:              string;
  amount:          number;
  settled_amount?: number;
  settled?:        boolean;
  status?:         string;
  payment_method?: string;
  sale_id?:        string;
  created_at:      string;
}

export interface CustomerLedger {
  outstanding_balance: number;
  credit_limit:        number;
  entries:             CustomerLedgerEntry[];
}

// ─── Stock Orders ────────────────────────────────────────────────────────────

export interface StockMovementItem {
  product_id:               string;
  product_name:             string;
  sku:                      string;
  batch_number:             string;
  expiry_date:              string;
  quantity:                 number;
  confirmed_quantity:       number;
  purchase_price:           number;
  selling_price:            number;
  basic_sku?:               string | null;
  basic_sku_count:          number;
  basic_sku_quantity:       number;
  basic_sku_selling_price:  number;
  basic_sku_purchase_price: number;
  stock_location_id?:       string | null;
  stock_location_name?:     string | null;
  is_confirmed:             boolean;
  reason?:                  string | null;
}

export interface StockMovement {
  id:              string;
  movement_number: string;
  type:            StockMovementType;
  branch_id:       string;
  status:          StockMovementStatus;
  items:           StockMovementItem[];
  notes?:          string | null;
  created_at?:     string;
  updated_at?:     string;
  created_by_id?:  string;
  updated_by_id?:  string;
}

// ─── Stock Transfer ───────────────────────────────────────────────────────────

export interface StockTransferItem {
  product_id:        string;
  product_name:      string;
  batch_number:      string;
  quantity:          number;
  received_quantity?: number;
}

export interface StockTransfer {
  id:                      string;
  transfer_number?:        string;
  source_branch_id:        string;
  source_branch_name:      string;
  destination_branch_id:   string;
  destination_branch_name: string;
  items:                   StockTransferItem[];
  status:                  TransferStatus;
  initiated_by:            string;
  dispatched_by?:          string | null;
  dispatched_at?:          string | null;
  confirmed_by?:           string | null;
  confirmed_at?:           string | null;
  received_by?:            string | null;
  received_at?:            string | null;
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
  updated_by_id?:   string;
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
  updated_by_id?:   string;
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
  paid_source_type?: string;
  paid_source_id?:   string;
  paid_source_name?: string;
  created_at:       string;
  updated_at:       string;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  branch_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  user_role: UserRole;
  branch_id?: string;
  action: string;
  resource: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  timestamp: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardRecentSale {
  id:             string;
  customer_name:  string;
  total_amount:   number;
  payment_method: string;
  created_at?:    string;
}

export interface DashboardBranchSummary {
  branch_id:        string;
  branch_name:      string;
  today_sales:      number;
  low_stock_count:  number;
  expiring_count:   number;
  pending_po_count: number;
}

export interface DashboardStats {
  total_branches:   number;
  today_sales:      number;
  month_sales:      number;
  low_stock_count:  number;
  expiring_count:   number;
  pending_po_count: number;
  recent_sales:     DashboardRecentSale[];
  branch_summaries: DashboardBranchSummary[];
}

export interface RevenueTrendPoint {
  date:   string;
  amount: number;
  count:  number;
}

export interface TopProduct {
  product_name: string;
  total_qty:    number;
  total_amount: number;
}

export interface PaymentBreakdown {
  method: string;
  count:  number;
  amount: number;
}

export interface DashboardCharts {
  revenue_trend:     RevenueTrendPoint[];
  top_products:      TopProduct[];
  payment_breakdown: PaymentBreakdown[];
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
  updated_by_id?:           string;
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
  updated_by_id?:  string;
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
  updated_by_id?:    string;
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
  updated_by_id?:    string;
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
