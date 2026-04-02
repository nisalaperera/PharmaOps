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
  columns:      Column<T>[];
  data:         T[];
  isLoading?:   boolean;
  emptyMessage?: string;
  sort?:         SortConfig;
  onSort?:       (field: string) => void;
  rowKey:        (row: T) => string;
  onRowClick?:   (row: T) => void;
  className?:    string;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="px-4 py-3">
              <div
                className="h-4 rounded animate-pulse"
                style={{
                  background: "var(--color-surface-2)",
                  width: `${60 + Math.random() * 30}%`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
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
  isLoading    = false,
  emptyMessage = "No records found.",
  sort,
  onSort,
  rowKey,
  onRowClick,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("table-wrapper", className)}>
      <table className="data-table">
        <thead>
          <tr>
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
            <TableSkeleton columns={columns.length} />
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
