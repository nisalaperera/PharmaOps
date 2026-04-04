import type { UserRole, UserStatus } from "@/types";
import { getRoleLabel } from "@/lib/utils";

// ─── Role ──────────────────────────────────────────────────────────────────────

/** All roles ordered highest → lowest privilege, for dropdowns */
export const ROLE_OPTIONS: { value: UserRole; label: string }[] = (
  ["ADMIN", "MANAGER", "BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"] as UserRole[]
).map((value) => ({ value, label: getRoleLabel(value) }));

/** Roles that require a branch assignment */
export const BRANCH_ROLES: UserRole[] = ["BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"];

// ─── User Status ───────────────────────────────────────────────────────────────

export const USER_STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

/** For filter dropdowns — includes an "All" option */
export const USER_STATUS_FILTER_OPTIONS: { value: UserStatus | ""; label: string }[] = [
  { value: "",         label: "All Statuses" },
  { value: "ACTIVE",   label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

// ─── Active / Inactive filter (branches, staff, suppliers, …) ─────────────────

export const ACTIVE_STATUS_OPTIONS = [
  { value: "",      label: "All Statuses" },
  { value: "true",  label: "Active" },
  { value: "false", label: "Inactive" },
];
