"use client";

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { isBranchRole } from "@/lib/utils";

const STORAGE_KEY = "pharmaops_active_branch";

export interface BranchContextValue {
  activeBranchId: string | null;
  setActiveBranchId: (id: string | null) => void;
  isLocked: boolean;
}

export const BranchContext = createContext<BranchContextValue>({
  activeBranchId:    null,
  setActiveBranchId: () => {},
  isLocked:          false,
});

export function BranchProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const queryClient       = useQueryClient();

  const userRole     = session?.user?.role;
  const userBranchId = session?.user?.branchId ?? null;
  const isLocked     = !!userRole && isBranchRole(userRole);

  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    if (isLocked) return userBranchId;
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  useEffect(() => {
    if (isLocked && userBranchId) {
      setActiveBranchIdState(userBranchId);
    }
  }, [isLocked, userBranchId]);

  const setActiveBranchId = useCallback(
    (id: string | null) => {
      if (isLocked) return;
      setActiveBranchIdState(id);
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      queryClient.invalidateQueries();
    },
    [isLocked, queryClient],
  );

  return (
    <BranchContext.Provider value={{ activeBranchId, setActiveBranchId, isLocked }}>
      {children}
    </BranchContext.Provider>
  );
}
