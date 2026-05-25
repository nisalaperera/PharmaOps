"use client";

import { useState }                   from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Receipt, Eye, SlidersHorizontal, Download,
} from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { SearchBar }               from "@/components/common/SearchBar";
import { FilterBar }               from "@/components/common/FilterBar";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { useAuth }                 from "@/hooks/useAuth";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet, apiDownloadFile } from "@/lib/api-client";
import { showToast }               from "@/lib/toast";
import { formatDateTime }          from "@/lib/utils";
import {
  SALE_STATUS_FILTER_OPTIONS, PAYMENT_METHOD_FILTER_OPTIONS,
  PAYMENT_METHOD_LABEL,
} from "@/lib/constants";
import { SALE_STATUS_VARIANT, PAYMENT_METHOD_VARIANT } from "@/lib/badges";
import { SaleViewModal }   from "./components/SaleViewModal";
import { SaleRefundModal } from "./components/SaleRefundModal";
import type { Sale, PaginatedResponse } from "@/types";

// ─── Export helper ────────────────────────────────────────────────────────────

async function downloadCsvExport(filters: Record<string, string>) {
  try {
    await apiDownloadFile("/sales/invoices/export", filters);
  } catch {
    showToast("error", "Export Failed", "Could not download the sales CSV.");
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { permissions } = useAuth();
  const canRefund       = permissions?.can("BRANCH_ADMIN") ?? false;

  // ── Filter state ─────────────────────────────────────────────────────────────

  const [statusFilter,        setStatusFilter]        = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [startDate,           setStartDate]           = useState("");
  const [endDate,             setEndDate]             = useState("");
  const [filterVisible,       setFilterVisible]       = useState(false);

  // ── Modal state ──────────────────────────────────────────────────────────────

  const [viewingSale,  setViewingSale]  = useState<Sale | null>(null);
  const [refundingSale, setRefundingSale] = useState<Sale | null>(null);

  // ── Pagination ───────────────────────────────────────────────────────────────

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at" });

  // ── Filters ──────────────────────────────────────────────────────────────────

  const filters = {
    ...(statusFilter        && { status: statusFilter }),
    ...(paymentMethodFilter && { payment_method: paymentMethodFilter }),
    ...(startDate           && { start_date: startDate }),
    ...(endDate             && { end_date: endDate }),
  };

  const activeFilterCount = [statusFilter, paymentMethodFilter, startDate, endDate].filter(Boolean).length;
  const hasActiveFilters  = activeFilterCount > 0;

  function clearFilters() {
    setStatusFilter("");
    setPaymentMethodFilter("");
    setStartDate("");
    setEndDate("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Sale>>({
    queryKey:        ["sales", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<Sale>>("/sales/invoices", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const sales      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ── Column definitions ───────────────────────────────────────────────────────

  const columns: Column<Sale>[] = [
    {
      key:      "created_at",
      header:   "Date / Time",
      sortable: true,
      render:   (row) => (
        <span className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key:    "id",
      header: "Sale ID",
      render: (row) => (
        <span className="font-mono text-xs font-semibold" style={{ color: "var(--color-text)" }}>
          #{row.id.slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      key:      "customer_name",
      header:   "Customer",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: row.customer_name ? "var(--color-text)" : "var(--color-text-muted)" }}>
          {row.customer_name || "Walk-in"}
        </span>
      ),
    },
    {
      key:    "cashier_name",
      header: "Cashier",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{row.cashier_name}</span>
      ),
    },
    {
      key:    "items",
      header: "Items",
      render: (row) => (
        <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {row.items.length}
        </span>
      ),
    },
    {
      key:      "total_amount",
      header:   "Total",
      sortable: true,
      render:   (row) => (
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
          LKR {row.total_amount.toFixed(2)}
        </span>
      ),
    },
    {
      key:    "payment_method",
      header: "Payment",
      render: (row) => (
        <Badge variant={PAYMENT_METHOD_VARIANT[row.payment_method] ?? "default"}>
          {PAYMENT_METHOD_LABEL[row.payment_method] ?? row.payment_method}
        </Badge>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (row) => (
        <Badge variant={SALE_STATUS_VARIANT[row.status]}>
          {row.status === "PARTIAL_REFUND" ? "Partial Refund" : row.status === "REFUNDED" ? "Refunded" : "Completed"}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "80px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewingSale(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Sales History</h1>
          </div>
          <p className="page-subtitle mt-1">View and manage sales transactions from the POS terminal</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter toggle */}
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
            placeholder="Search by customer, cashier…"
            onSearch={handleSearch}
            className="w-[26rem] max-w-full"
          />

          {/* Export */}
          <div
            className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => downloadCsvExport({ ...filters, ...(search && { search }) })}
            >
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={hideFilters}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }}
            className="form-select w-auto"
          >
            {SALE_STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Payment Method</label>
          <select
            value={paymentMethodFilter}
            onChange={(e) => { setPaymentMethodFilter(e.target.value); goToPage(1); }}
            className="form-select w-auto"
          >
            {PAYMENT_METHOD_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); goToPage(1); }}
            className="form-input text-sm h-9"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>To Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); goToPage(1); }}
            className="form-input text-sm h-9"
          />
        </div>
      </FilterBar>

      {/* ── Table card ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        <DataTable<Sale>
          columns={columns}
          data={sales}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No sales found matching "${search}"` : "No sales recorded yet."}
        />

        {/* Pagination */}
        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {totalItems > 0 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={totalPages}
              totalRecords={totalItems}
              pageSize={pagination.pageSize}
              onPageChange={goToPage}
              onPageSizeChange={changePageSize}

            />
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <SaleViewModal
        isOpen={!!viewingSale}
        onClose={() => setViewingSale(null)}
        sale={viewingSale}
        canRefund={canRefund}
        onRefund={(sale) => setRefundingSale(sale)}
      />

      <SaleRefundModal
        isOpen={!!refundingSale}
        onClose={() => setRefundingSale(null)}
        sale={refundingSale}
      />
    </div>
  );
}
