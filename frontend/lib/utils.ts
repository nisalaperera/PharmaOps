import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { UserRole } from "@/types";

/** Tailwind class merger */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Role hierarchy — higher index = higher privilege */
const ROLE_HIERARCHY: UserRole[] = [
  "BRANCH_USER",
  "BRANCH_MANAGER",
  "BRANCH_ADMIN",
  "MANAGER",
  "ADMIN",
];

export function hasPermission(
  userRole: UserRole,
  requiredRole: UserRole
): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

export function isBranchRole(role: UserRole): boolean {
  return ["BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"].includes(role);
}

export function isOrgRole(role: UserRole): boolean {
  return ["ADMIN", "MANAGER"].includes(role);
}

/** Format currency */
export function formatCurrency(
  amount: number,
  currency = "LKR",
  locale = "en-LK"
): string {
  return new Intl.NumberFormat(locale, {
    style:    "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format date */
export function formatDate(
  dateString: string,
  format: "short" | "medium" | "long" = "medium"
): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions =
    format === "short"
      ? { day: "2-digit", month: "2-digit", year: "numeric" }
      : format === "medium"
      ? { day: "2-digit", month: "short",   year: "numeric" }
      : { day: "2-digit", month: "long",    year: "numeric", weekday: "long" };
  return new Intl.DateTimeFormat("en-LK", options).format(date);
}

/** Format datetime */
export function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

/** Days until expiry */
export function daysUntilExpiry(expiryDate: string): number {
  const today  = new Date();
  const expiry = new Date(expiryDate);
  const diff   = expiry.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Truncate text */
export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** Generate initials from full name */
export function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/** Role display label */
export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    ADMIN:          "Admin",
    MANAGER:        "Manager",
    BRANCH_ADMIN:   "Branch Admin",
    BRANCH_MANAGER: "Branch Manager",
    BRANCH_USER:    "Branch User",
  };
  return labels[role];
}

/** Generate a random secure password */
export function generatePassword(): string {
  const upper   = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower   = "abcdefghjkmnpqrstuvwxyz";
  const digits  = "23456789";
  const special = "!@#$%";
  const all     = upper + lower + digits + special;
  const rand    = (set: string) => set[Math.floor(Math.random() * set.length)];
  const base    = Array.from({ length: 8 }, () => rand(all));
  // Guarantee at least one of each required character class
  base[0] = rand(upper);
  base[1] = rand(lower);
  base[2] = rand(digits);
  base[3] = rand(special);
  return base.sort(() => Math.random() - 0.5).join("");
}

/** Format phone number as ### ### #### */
export function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Debounce */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
