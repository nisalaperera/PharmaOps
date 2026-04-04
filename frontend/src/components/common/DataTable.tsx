"use client";

import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortConfig } from "@/types";

// ─── Column definition ────────────────────────────────────────────────────────

export interface Column<T> {
  key:        string;
  header:     string;
  sortable?:  boolean;
  width?:     string;
  className?: string;
  render:     (row: T, index: number) => React.ReactNode;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DataTableProps<T> {
  columns:           Column<T>[];
  data:              T[];
  isLoading?:        boolean;
  /** True during background refetches (filter/sort/page changes) — shows overlay on existing rows */
  isFetching?:       boolean;
  emptyMessage?:     string;
  sort?:             SortConfig;
  onSort?:           (field: string) => void;
  rowKey:            (row: T) => string;
  onRowClick?:       (row: T) => void;
  className?:        string;
  /** Enable row-level checkboxes */
  selectable?:       boolean;
  /** Set of selected row keys (controlled) */
  selectedKeys?:     Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
}

// ─── Loading spinner ──────────────────────────────────────────────────────────

function TableLoadingSpinner({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <span
            className="w-8 h-8 border-[3px] border-current/20 border-t-primary-500 rounded-full animate-spin"
            style={{ color: "var(--color-text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading…
          </p>
        </div>
      </td>
    </tr>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ field, sort }: { field: string; sort?: SortConfig }) {
  if (!sort || sort.field !== field) {
    return <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />;
  }
  return sort.direction === "asc"
    ? <ChevronUp className="w-3.5 h-3.5 text-primary-500" />
    : <ChevronDown className="w-3.5 h-3.5 text-primary-500" />;
}

// ─── DataTable ────────────────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  isLoading         = false,
  isFetching        = false,
  emptyMessage      = "No records found.",
  sort,
  onSort,
  rowKey,
  onRowClick,
  className,
  selectable        = false,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {
  const allPageKeys      = data.map(rowKey);
  const allPageSelected  = allPageKeys.length > 0 && allPageKeys.every((k) => selectedKeys?.has(k));
  const somePageSelected = !allPageSelected && allPageKeys.some((k) => selectedKeys?.has(k));

  function handleHeaderCheckbox() {
    if (!onSelectionChange || !selectedKeys) return;
    if (allPageSelected) {
      // Deselect all current page rows
      const next = new Set(selectedKeys);
      allPageKeys.forEach((k) => next.delete(k));
      onSelectionChange(next);
    } else {
      // Select all current page rows (preserve existing selections from other pages)
      const next = new Set(selectedKeys);
      allPageKeys.forEach((k) => next.add(k));
      onSelectionChange(next);
    }
  }

  function handleRowCheckbox(key: string) {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  }

  const totalColumns = selectable ? columns.length + 1 : columns.length;

  const showOverlay = isFetching && !isLoading;

  return (
    <div className={cn("table-wrapper relative", className)}>
      {/* Refetch overlay — shown during filter/sort/page changes */}
      {showOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div
            className="flex items-center gap-2.5 px-4 py-2 rounded-lg shadow-md text-sm font-medium"
            style={{
              background: "var(--color-surface)",
              color:      "var(--color-text-muted)",
              border:     "1px solid var(--color-border)",
            }}
          >
            <span className="w-4 h-4 border-2 border-current/20 border-t-primary-500 rounded-full animate-spin flex-shrink-0" />
            Loading…
          </div>
        </div>
      )}
      <table className={cn("data-table", showOverlay && "opacity-50 pointer-events-none transition-opacity")}>
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: "44px" }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => { if (el) el.indeterminate = somePageSelected; }}
                  onChange={handleHeaderCheckbox}
                  className="w-4 h-4 rounded accent-primary-500 cursor-pointer"
                  aria-label="Select all on page"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={cn(
                  col.className,
                  col.sortable && onSort && "cursor-pointer select-none hover:text-[var(--color-text)]"
                )}
                onClick={() => col.sortable && onSort && onSort(col.key)}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && onSort && (
                    <SortIcon field={col.key} sort={sort} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading ? (
            <TableLoadingSpinner columns={totalColumns} />
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={totalColumns}
                className="px-4 py-12 text-center text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const key       = rowKey(row);
              const isSelected = selectedKeys?.has(key) ?? false;
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    onRowClick && "cursor-pointer",
                    isSelected && "row-selected"
                  )}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleRowCheckbox(key)}
                        className="w-4 h-4 rounded accent-primary-500 cursor-pointer"
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={col.className}>
                      {col.render(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
