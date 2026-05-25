import type {
  UserRole, UserStatus, PaymentMethod, AttendanceStatus,
  SkuType, PurchaseOrderStatus, GRNStatus,
  PurchaseInvoicePaymentStatus, SalesOrderStatus, TransferStatus,
  SupplierType, ChannelCategory, ContactType,
} from "@/types";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline";

// ─── Role ──────────────────────────────────────────────────────────────────────
// Uses raw Tailwind classes (not the Badge component) to support per-role colors

export function getRoleBadgeColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    ADMIN:          "bg-danger-100 text-danger-700 dark:bg-danger-900 dark:text-danger-300",
    MANAGER:        "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    BRANCH_ADMIN:   "bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300",
    BRANCH_MANAGER: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    BRANCH_USER:    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  };
  return colors[role];
}

// ─── User status ───────────────────────────────────────────────────────────────

export const USER_STATUS_VARIANT: Record<UserStatus, BadgeVariant> = {
  ACTIVE:   "success",
  INACTIVE: "default",
};

// ─── Active / Inactive (branches, staff, suppliers, products, …) ───────────────

export function getActiveStatusVariant(isActive: boolean): BadgeVariant {
  return isActive ? "success" : "default";
}

// ─── Attendance status ─────────────────────────────────────────────────────────

export const ATTENDANCE_STATUS_VARIANT: Record<AttendanceStatus, BadgeVariant> = {
  PRESENT:  "success",
  ABSENT:   "danger",
  LATE:     "warning",
  HALF_DAY: "info",
};

// ─── SKU type ────────────────────────────────────────────────────────────────

export const SKU_TYPE_VARIANT: Record<SkuType, BadgeVariant> = {
  COUNT:  "info",
  VOLUME: "default",
  WEIGHT: "warning",
  LENGTH: "success",
};


// ─── Transfer status ─────────────────────────────────────────────────────────

export const TRANSFER_STATUS_VARIANT: Record<TransferStatus, BadgeVariant> = {
  PENDING:   "warning",
  CONFIRMED: "success",
  REJECTED:  "danger",
  CANCELLED: "default",
};

// ─── Purchase Order status ────────────────────────────────────────────────────

export const PO_STATUS_VARIANT: Record<PurchaseOrderStatus, BadgeVariant> = {
  DRAFT:            "default",
  PENDING_APPROVAL: "warning",
  APPROVED:         "info",
  SENT:             "info",
  PARTIAL:          "warning",
  RECEIVED:         "success",
  CANCELLED:        "danger",
};

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT:            "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED:         "Approved",
  SENT:             "Sent",
  PARTIAL:          "Partial",
  RECEIVED:         "Received",
  CANCELLED:        "Cancelled",
};

// ─── GRN status ───────────────────────────────────────────────────────────────

export const GRN_STATUS_VARIANT: Record<GRNStatus, BadgeVariant> = {
  PENDING:   "warning",
  PARTIAL:   "info",
  COMPLETED: "success",
};

export const GRN_STATUS_LABEL: Record<GRNStatus, string> = {
  PENDING:   "Pending",
  PARTIAL:   "Partial",
  COMPLETED: "Completed",
};

// ─── Payment method ────────────────────────────────────────────────────────────

export const PAYMENT_METHOD_VARIANT: Record<PaymentMethod, BadgeVariant> = {
  CASH:          "success",
  CARD:          "info",
  BANK_TRANSFER: "default",
  CREDIT:        "warning",
  CHEQUE:        "default",
};

// ─── Treasury ─────────────────────────────────────────────────────────────────

import type { RegistryTransactionType } from "@/types";

export const REGISTRY_TRANSACTION_VARIANT: Record<RegistryTransactionType, BadgeVariant> = {
  OPENING:      "info",
  CLOSING:      "warning",
  DEPOSIT:      "success",
  WITHDRAWAL:   "danger",
  TRANSFER_IN:  "success",
  TRANSFER_OUT: "danger",
};

export function getRegistryStatusVariant(isOpen: boolean): BadgeVariant {
  return isOpen ? "success" : "default";
}

// ─── Purchase Invoice payment status ──────────────────────────────────────────

export const PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT: Record<PurchaseInvoicePaymentStatus, BadgeVariant> = {
  UNPAID:         "danger",
  PARTIALLY_PAID: "warning",
  PAID:           "success",
};

export const PURCHASE_INVOICE_PAYMENT_STATUS_LABEL: Record<PurchaseInvoicePaymentStatus, string> = {
  UNPAID:         "Unpaid",
  PARTIALLY_PAID: "Partially Paid",
  PAID:           "Paid",
};

// ─── Sales Order status ────────────────────────────────────────────────────────

export const SALES_ORDER_STATUS_VARIANT: Record<SalesOrderStatus, BadgeVariant> = {
  DRAFT:     "default",
  CONFIRMED: "info",
  INVOICED:  "success",
  CANCELLED: "danger",
};

export const SALES_ORDER_STATUS_LABEL: Record<SalesOrderStatus, string> = {
  DRAFT:     "Draft",
  CONFIRMED: "Confirmed",
  INVOICED:  "Invoiced",
  CANCELLED: "Cancelled",
};

// ─── POS card type ────────────────────────────────────────────────────────────

import type { PosCardType } from "@/types";

export const POS_CARD_TYPE_VARIANT: Record<PosCardType, BadgeVariant> = {
  VISA:       "info",
  MASTERCARD: "warning",
  AMEX:       "success",
  OTHER:      "default",
};

// ─── Supplier type ────────────────────────────────────────────────────────────

export const SUPPLIER_TYPE_VARIANT: Record<SupplierType, BadgeVariant> = {
  AGENCY:      "info",
  DISTRIBUTOR: "warning",
};

export const SUPPLIER_TYPE_LABEL: Record<SupplierType, string> = {
  AGENCY:      "Agency",
  DISTRIBUTOR: "Distributor",
};

export const CHANNEL_CATEGORY_VARIANT: Record<ChannelCategory, BadgeVariant> = {
  AGENCY: "info",
  SUB:    "default",
};

export const CONTACT_TYPE_VARIANT: Record<ContactType, BadgeVariant> = {
  SALES:    "success",
  DELIVERY: "warning",
};

// ─── Sale status ──────────────────────────────────────────────────────────────

import type { SaleStatus, ChequeIssueStatus } from "@/types";

export const SALE_STATUS_VARIANT: Record<SaleStatus, BadgeVariant> = {
  COMPLETED:      "success",
  REFUNDED:       "danger",
  PARTIAL_REFUND: "warning",
};

// ─── Cheque issue status ───────────────────────────────────────────────────────

export const CHEQUE_ISSUE_STATUS_VARIANT: Record<ChequeIssueStatus, BadgeVariant> = {
  ISSUED:    "info",
  CLEARED:   "success",
  BOUNCED:   "danger",
  CANCELLED: "default",
};
