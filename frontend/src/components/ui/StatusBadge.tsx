import { Badge } from "@/components/ui/Badge";
import { USER_STATUS_VARIANT } from "@/lib/badges";
import type { UserStatus } from "@/types";

interface StatusBadgeProps {
  status: UserStatus;
}

/** Reusable Active / Inactive badge — shared between Users and Branches */
export function StatusBadge({ status }: StatusBadgeProps) {
  const label = status === "ACTIVE" ? "Active" : "Inactive";
  return <Badge variant={USER_STATUS_VARIANT[status]}>{label}</Badge>;
}
