"use client";

import { useState }                   from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  ClipboardList, Eye, CheckCircle, XCircle,
  FileText, SlidersHorizontal, Download, Receipt,
} from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { SearchBar }               from "@/components/common/SearchBar";
import { FilterBar }               from "@/components/common/FilterBar";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { ConfirmModal }            from "@/components/ui/ConfirmModal";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet, apiPost, apiDownloadFile } from "@/lib/api-client";
import { showToast }               from "@/lib/toast";
import { formatDateTime }          from "@/lib/utils";
import { SALES_ORDER_STATUS_FILTER_OPTIONS } from "@/lib/constants";
import { SALES_ORDER_STATUS_VARIANT, SALES_ORDER_STATUS_LABEL } from "@/lib/badges";
import { SalesOrderViewModal }      from "./components/SalesOrderViewModal";
import { ConvertToInvoiceModal }    from "./components/ConvertToInvoiceModal";
import { ExportQuotationPdfModal }  from "./components/ExportQuotationPdfModal";
import type { SalesOrder, PaginatedResponse } from "@/types";

async function downloadCsvExport(filters: Record<string, string>) {
  try {
    await apiDownloadFile("/sales/orders/export", filters);
  } catch {
    showToast("error", "Export Failed", "Could not download the sales orders CSV.");
  }
}

export default function SalesOrdersPage() {
  const queryClient = useQueryClient();

  const [statusFilter,  setStatusFilter]  = useState("");
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  const [viewingOrder,     setViewingOrder]     = useState<SalesOrder | null>(null);
  const [convertingOrder,  setConvertingOrder]  = useState<SalesOrder | null>(null);
  const [quotationOrder,   setQuotationOrder]   = useState<SalesOrder | null>(null);
  const [confirmingOrder,  setConfirmingOrder]  = useState<SalesOrder | null>(null);
  const [cancellingOrder,  setCancellingOrder]  = useState<SalesOrder | null>(null);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at" });

  const filters = {
    ...(statusFilter && { status: statusFilter }),
    ...(startDate    && { start_date: startDate }),
    ...(endDate      && { end_date: endDate }),
  };

  const activeFilterCount = [statusFilter, startDate, endDate].filter(Boolean).length;
  const hasActiveFilters  = activeFilterCount > 0;

  function clearFilters() {
    setStatusFilter("");
    setStartDate("");
    setEndDate("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<SalesOrder>>({
    queryKey:        ["sales-orders", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<SalesOrder>>("/sales/orders", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const orders     = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ── Confirm mutation
  const confirmMutation = useMutation({
    mutationFn: (orderId: string) => apiPost(`/sales/orders/${orderId}/confirm`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      showToast("success", "Order Confirmed", "Sales order status updated to Confirmed.");
      setConfirmingOrder(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Confirm Failed", err?.message ?? "Could not confirm the order.");
    },
  });

  // ── Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => apiPost(`/sales/orders/${orderId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      showToast("success", "Order Cancelled", "Sales order has been cancelled.");
      setCancellingOrder(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Cancel Failed", err?.message ?? "Could not cancel the order.");
    },
  });

  const columns: Column<SalesOrder>[] = [
    {
      key:      "created_at",
      header:   "Created",
      sortable: true,
      render:   (row) => (
        <span className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key:    "id",
      header: "Order #",
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
      key:    "status",
      header: "Status",
      render: (row) => (
        <Badge variant={SALES_ORDER_STATUS_VARIANT[row.status]}>
          {SALES_ORDER_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "160px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View"
            onClick={(e) => { e.stopPropagation(); setViewingOrder(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {(row.status === "DRAFT" || row.status === "CONFIRMED") && (
            <button
              title="Generate Quotation"
              onClick={(e) => { e.stopPropagation(); setQuotationOrder(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
          )}

          {row.status === "DRAFT" && (
            <button
              title="Confirm Order"
              onClick={(e) => { e.stopPropagation(); setConfirmingOrder(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}

          {row.status === "CONFIRMED" && (
            <button
              title="Convert to Invoice"
              onClick={(e) => { e.stopPropagation(); setConvertingOrder(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Receipt className="w-3.5 h-3.5" />
            </button>
          )}

          {(row.status === "DRAFT" || row.status === "CONFIRMED") && (
            <button
              title="Cancel Order"
              onClick={(e) => { e.stopPropagation(); setCancellingOrder(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-danger-50 dark:hover:bg-danger-900/20"
              style={{ color: "var(--color-text-muted)" }}
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Sales Orders</h1>
          </div>
          <p className="page-subtitle mt-1">Manage pre-sale orders — confirm and convert to invoices</p>
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
            placeholder="Search by customer…"
            onSearch={handleSearch}
            className="w-[22rem] max-w-full"
          />

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
            {SALES_ORDER_STATUS_FILTER_OPTIONS.map((opt) => (
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

      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        <DataTable<SalesOrder>
          columns={columns}
          data={orders}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          onRowClick={(row) => setViewingOrder(row)}
          emptyMessage={search ? `No orders found matching "${search}"` : "No sales orders yet. Create one from POS in Order mode."}
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

            />
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <SalesOrderViewModal
        isOpen={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        order={viewingOrder}
      />

      <ConvertToInvoiceModal
        isOpen={!!convertingOrder}
        onClose={() => setConvertingOrder(null)}
        order={convertingOrder}
      />

      <ExportQuotationPdfModal
        isOpen={!!quotationOrder}
        onClose={() => setQuotationOrder(null)}
        order={quotationOrder}
      />

      <ConfirmModal
        isOpen={!!confirmingOrder}
        onClose={() => setConfirmingOrder(null)}
        onConfirm={() => confirmingOrder && confirmMutation.mutate(confirmingOrder.id)}
        title="Confirm Order"
        message={`Confirm sales order #${confirmingOrder?.id.slice(-8).toUpperCase()}? Status will change from Draft to Confirmed.`}
        confirmLabel="Confirm Order"
        isLoading={confirmMutation.isPending}
      />

      <ConfirmModal
        isOpen={!!cancellingOrder}
        onClose={() => setCancellingOrder(null)}
        onConfirm={() => cancellingOrder && cancelMutation.mutate(cancellingOrder.id)}
        title="Cancel Order"
        message={`Cancel sales order #${cancellingOrder?.id.slice(-8).toUpperCase()}? This action cannot be undone.`}
        confirmLabel="Cancel Order"
        variant="danger"
        isLoading={cancelMutation.isPending}
      />
    </div>
  );
}
