"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage:  number;
  totalPages:   number;
  totalRecords: number;
  pageSize:     number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?:   string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalRecords,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: PaginationProps) {
  const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord   = Math.min(currentPage * pageSize, totalRecords);

  // Build page number range (show max 5 pages around current)
  const pageNumbers = buildPageRange(currentPage, totalPages);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3",
        className
      )}
    >
      {/* Records info + page size */}
      <div className="flex items-center gap-3">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Showing{" "}
          <span className="font-medium" style={{ color: "var(--color-text)" }}>
            {startRecord}–{endRecord}
          </span>{" "}
          of{" "}
          <span className="font-medium" style={{ color: "var(--color-text)" }}>
            {totalRecords}
          </span>
        </p>

        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="text-sm rounded-lg px-2 py-1 border focus:outline-none focus:ring-2 focus:ring-primary-500"
            style={{
              background:  "var(--color-surface)",
              borderColor: "var(--color-border)",
              color:       "var(--color-text)",
            }}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Page controls */}
      <div className="flex items-center gap-1">
        {/* First */}
        <PaginationButton
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          aria-label="First page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </PaginationButton>

        {/* Prev */}
        <PaginationButton
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </PaginationButton>

        {/* Page numbers */}
        {pageNumbers.map((page, index) =>
          page === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="w-8 h-8 flex items-center justify-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              …
            </span>
          ) : (
            <PaginationButton
              key={page}
              onClick={() => onPageChange(page as number)}
              isActive={currentPage === page}
            >
              {page}
            </PaginationButton>
          )
        )}

        {/* Next */}
        <PaginationButton
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </PaginationButton>

        {/* Last */}
        <PaginationButton
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || totalPages === 0}
          aria-label="Last page"
        >
          <ChevronsRight className="w-4 h-4" />
        </PaginationButton>
      </div>
    </div>
  );
}

// ─── PaginationButton ─────────────────────────────────────────────────────────

function PaginationButton({
  children,
  onClick,
  disabled,
  isActive,
  "aria-label": ariaLabel,
}: {
  children:    React.ReactNode;
  onClick:     () => void;
  disabled?:   boolean;
  isActive?:   boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium",
        "transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        isActive
          ? "bg-primary-500 text-white shadow-sm"
          : "hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
      )}
    >
      {children}
    </button>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildPageRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];
  pages.push(1);

  if (current > 3)           pages.push("...");

  const rangeStart = Math.max(2, current - 1);
  const rangeEnd   = Math.min(total - 1, current + 1);

  for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);

  if (current < total - 2)   pages.push("...");
  pages.push(total);

  return pages;
}
