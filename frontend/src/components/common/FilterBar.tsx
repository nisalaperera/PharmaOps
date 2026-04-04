"use client";

import { X, RotateCcw } from "lucide-react";

interface FilterBarProps {
  /** Controls whether the bar is rendered */
  isVisible:        boolean;
  /** True when at least one filter has a non-default value */
  hasActiveFilters: boolean;
  /** Resets all filters to their defaults */
  onClear:          () => void;
  /** Collapses the bar */
  onHide:           () => void;
  children:         React.ReactNode;
}

export function FilterBar({
  isVisible,
  hasActiveFilters,
  onClear,
  onHide,
  children,
}: FilterBarProps) {
  if (!isVisible) return null;

  return (
    <div
      className="rounded-2xl shadow-card px-5 py-4"
      style={{ background: "var(--color-surface)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter controls passed by the parent */}
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          {children}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {hasActiveFilters && (
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
          <button
            onClick={onHide}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Hide filters"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
