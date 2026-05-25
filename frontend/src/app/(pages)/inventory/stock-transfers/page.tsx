"use client";

import { useState, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowLeftRight, Plus, Eye, SlidersHorizontal, ArrowRight } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet }                 from "@/lib/api-client";
import { TRANSFER_STATUS_FILTER_OPTIONS } from "@/lib/constants";
import { TRANSFER_STATUS_VARIANT }        from "@/lib/badges";
import { formatDateTime }                 from "@/lib/utils";
import { StockTransferModal }     from "./components/StockTransferModal";
import { StockTransferViewModal } from "./components/StockTransferViewModal";
import type { StockTransfer, PaginatedResponse } from "@/types";

export default function StockTransfersPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;

  const [statusFilter,  setStatusFilter]  = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [viewTransfer,  setViewTransfer]  = useState<StockTransfer | null>(null);

  const { pagination, sort, goToPage, handleSort, queryParams } = usePagination({
    
    initialSortField:     "created_at",
    initialSortDirection: "desc",
  });

  const filters = {
    ...(statusFilter && { status: statusFilter }),
  };

  const hasActiveFilters  = statusFilter !== "";
  const activeFilterCount = hasActiveFilters ? 1 : 0;

  function clearFilters() {
    setStatusFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  const { data, isLoading } = useQuery<PaginatedResponse<StockTransfer>>({
    queryKey:        ["stock-transfers", queryParams, filters],
    queryFn:         () =>
      apiGet<PaginatedResponse<StockTransfer>>("/inventory/stock-transfers", {
        ...queryParams,
        ...filters,
      }),
    placeholderData: keepPreviousData,
  });

  const transfers  = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = transfers.map((t) => t.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const columns: Column<StockTransfer>[] = [
    {
      key:    "route",
      header: "Transfer",
      render: (row) => (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>
            {row.source_branch_name || "—"}
          </span>
          <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>
            {row.destination_branch_name || "—"}
          </span>
        </div>
      ),
    },
    {
      key:    "items",
      header: "Items",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.items.length} item{row.items.length !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key:      "status",
      header:   "Status",
      sortable: true,
      render:   (row) => (
        <Badge variant={TRANSFER_STATUS_VARIANT[row.status]}>
          {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key:      "created_at",
      header:   "Date",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "70px",
      render: (row) => (
        <button
          title="View Details"
          onClick={(e) => { e.stopPropagation(); setViewTransfer(row); }}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
          style={{ color: "var(--color-text-muted)" }}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Stock Transfers</h1>
          </div>
          <p className="page-subtitle mt-1">
            Transfer inventory between branches
          </p>
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

          {canManage && (
            <Button
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setCreateOpen(true)}
            >
              New Transfer
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={hideFilters}
      >
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {TRANSFER_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      {/* Table card */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>

        {showSelectAllBanner && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>
              {pagination.pageSize} records on this page are selected.{" "}
            </span>
            <button onClick={handleSelectAllPages} className="font-semibold text-primary-500 hover:underline">
              Select all {totalItems} records
            </button>
          </div>
        )}

        {allPagesSelected && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span className="font-semibold text-primary-500">All {totalItems} records selected.</span>{" "}
            <button onClick={clearSelection} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
              Clear selection
            </button>
          </div>
        )}

        <DataTable<StockTransfer>
          columns={columns}
          data={transfers}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          onRowClick={(row) => setViewTransfer(row)}
          emptyMessage={
            hasActiveFilters
              ? "No transfers found matching the current filters."
              : "No stock transfers yet. Create one to get started."
          }
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
        />

        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {totalItems > 0 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={totalPages}
              totalRecords={totalItems}
              pageSize={pagination.pageSize}
              onPageChange={goToPage}
            />
          )}
        </div>
      </div>

      <StockTransferModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <StockTransferViewModal
        isOpen={!!viewTransfer}
        onClose={() => setViewTransfer(null)}
        transfer={viewTransfer}
        canManage={canManage}
      />
    </div>
  );
}
