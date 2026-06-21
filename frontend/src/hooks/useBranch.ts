"use client";

import { useContext } from "react";
import { BranchContext, type BranchContextValue } from "@/contexts/BranchContext";

export function useBranch(): BranchContextValue {
  return useContext(BranchContext);
}
