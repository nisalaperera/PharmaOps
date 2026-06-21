"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useBranch } from "@/hooks/useBranch";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Branch } from "@/types";

export function BranchSelector() {
  const { activeBranchId, setActiveBranchId, isLocked } = useBranch();
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["branches-selector"],
    queryFn:  () =>
      apiGet<{ data: Branch[] }>("/branches", { is_active: true, page_size: 100 }).then(
        (res) => res.data,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const displayName  = activeBranch?.name ?? "All Branches";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLocked) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
        style={{ color: "var(--color-text-muted)" }}
      >
        <Building2 className="w-3.5 h-3.5" />
        <span>{activeBranch?.name ?? "—"}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)]"
        style={{ color: "var(--color-text)" }}
      >
        <Building2 className="w-3.5 h-3.5" style={{ color: "var(--color-text-muted)" }} />
        <span className="max-w-[120px] truncate">{displayName}</span>
        <ChevronDown
          className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-56 rounded-xl shadow-card-lg border overflow-hidden animate-fade-in z-50"
          style={{
            background:  "var(--color-surface)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="py-1 max-h-72 overflow-y-auto">
            <button
              onClick={() => { setActiveBranchId(null); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]",
              )}
              style={{ color: "var(--color-text)" }}
            >
              All Branches
              {!activeBranchId && <Check className="w-4 h-4" style={{ color: "var(--color-primary)" }} />}
            </button>
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => { setActiveBranchId(branch.id); setOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text)" }}
              >
                <span className="truncate">{branch.name}</span>
                {activeBranchId === branch.id && (
                  <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-primary)" }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
