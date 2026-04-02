"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { hasPermission, isBranchRole, isOrgRole } from "@/lib/utils";
import type { UserRole } from "@/types";

export function useAuth() {
  const { data: session, status } = useSession();

  const user = session?.user ?? null;

  const permissions = useMemo(() => {
    if (!user) return null;

    return {
      isAdmin:         user.role === "ADMIN",
      isManager:       user.role === "MANAGER",
      isBranchAdmin:   user.role === "BRANCH_ADMIN",
      isBranchManager: user.role === "BRANCH_MANAGER",
      isBranchUser:    user.role === "BRANCH_USER",
      isOrgLevel:      isOrgRole(user.role),
      isBranchLevel:   isBranchRole(user.role),
      can: (requiredRole: UserRole) => hasPermission(user.role, requiredRole),
    };
  }, [user]);

  return {
    user,
    permissions,
    isLoading:       status === "loading",
    isAuthenticated: status === "authenticated",
  };
}
