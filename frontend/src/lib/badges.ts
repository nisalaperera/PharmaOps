import type { UserRole, UserStatus, PaymentMethod } from "@/types";

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

// ─── Payment method ────────────────────────────────────────────────────────────

export const PAYMENT_METHOD_VARIANT: Record<PaymentMethod, BadgeVariant> = {
  CASH:          "success",
  CARD:          "info",
  BANK_TRANSFER: "default",
  CREDIT:        "warning",
  CHEQUE:        "default",
};
