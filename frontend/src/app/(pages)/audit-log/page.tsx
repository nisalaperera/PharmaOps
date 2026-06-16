"use client";

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ScrollText, SlidersHorizontal, Eye } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet }                 from "@/lib/api-client";
import { cn, formatDateTime, getRoleLabel } from "@/lib/utils";
import { AUDIT_ACTION_FILTER_OPTIONS, AUDIT_RESOURCE_FILTER_OPTIONS } from "@/lib/constants";
import { getRoleBadgeColor, AUDIT_ACTION_VARIANT } from "@/lib/badges";
import { AuditLogViewModal } from "@/app/(pages)/audit-log/components/AuditLogViewModal";
import type { AuditLog, PaginatedResponse } from "@/types";

export default function AuditLogPage() {
  const { permissions } = useAuth();

  // — Filter state
  const [actionFilter,   setActionFilter]   = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");
  const [filterVisible,  setFilterVisible]  = useState(false);

  // — Modal state
  const [viewAuditLog, setViewAuditLog] = useState<AuditLog | null>(null);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialPageSize: 50, initialSortField: "timestamp", initialSortDirection: "desc" });

  const filters = {
    ...(actionFilter   && { action: actionFilter }),
    ...(resourceFilter && { resource: resourceFilter }),
    ...(dateFrom       && { date_from: dateFrom }),
    ...(dateTo         && { date_to: dateTo }),
  };

  const hasActiveFilters =
    actionFilter !== "" || resourceFilter !== "" || dateFrom !== "" || dateTo !== "";
  const activeFilterCount =
    (actionFilter ? 1 : 0) + (resourceFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  function clearFilters() {
    setActionFilter(""); setResourceFilter(""); setDateFrom(""); setDateTo("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  const { data, isLoading } = useQuery<PaginatedResponse<AuditLog>>({
    queryKey: ["audit-log", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<AuditLog>>("/audit-log", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
    enabled: !!permissions?.isAdmin,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const columns: Column<AuditLog>[] = [
    {
      key: "timestamp",
      header: "Timestamp",
      width: "180px",
      sortable: true,
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>
          {formatDateTime(row.timestamp)}
        </span>
      ),
    },
    {
      key: "user_email",
      header: "User",
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.user_email}
          </p>
          <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5", getRoleBadgeColor(row.user_role))}>
            {getRoleLabel(row.user_role)}
          </span>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      width: "110px",
      sortable: true,
      render: (row) => (
        <Badge variant={AUDIT_ACTION_VARIANT[row.action] ?? "default"}>{row.action}</Badge>
      ),
    },
    {
      key: "resource",
      header: "Module",
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm" style={{ color: "var(--color-text)" }}>{row.resource}</p>
          {row.resource_id && (
            <p className="text-xs mt-0.5 font-mono truncate max-w-[200px]" style={{ color: "var(--color-text-muted)" }}>
              {row.resource_id}
            </p>
          )}
        </div>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "70px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewAuditLog(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  // Backend enforces ADMIN; this guard just avoids rendering a broken page
  if (permissions && !permissions.isAdmin) {
    return (
      <div className="page-container">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          You do not have permission to view the audit log.
        </p>
      </div>
    );
  }

  return (
    <div className="page-container">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Audit Log</h1>
          </div>
          <p className="page-subtitle mt-1">Trail of user actions across all modules</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={filterVisible || hasActiveFilters ? "primary" : "outline"}
            size="sm"
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            onClick={() => setFilterVisible((v) => !v)}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <SearchBar
            placeholder="Search by user email or record ID…"
            onSearch={handleSearch}
            className="w-[30rem] max-w-full"
          />
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {AUDIT_ACTION_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => { setResourceFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {AUDIT_RESOURCE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); goToPage(1); }}
          className="form-select w-auto"
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); goToPage(1); }}
          className="form-select w-auto"
          title="To date"
        />
      </FilterBar>

      {/* ── Table card ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        <DataTable<AuditLog>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          onRowClick={(row) => setViewAuditLog(row)}
          emptyMessage={search ? `No audit entries found matching "${search}"` : "No audit entries found."}
        />

        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {totalItems > 0 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={totalPages}
              totalRecords={totalItems}
              pageSize={pagination.pageSize}
              onPageChange={goToPage}
              onPageSizeChange={changePageSize}
              pageSizeOptions={[20, 50, 100]}
            />
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <AuditLogViewModal
        isOpen={!!viewAuditLog}
        onClose={() => setViewAuditLog(null)}
        auditLog={viewAuditLog}
      />
    </div>
  );
}
