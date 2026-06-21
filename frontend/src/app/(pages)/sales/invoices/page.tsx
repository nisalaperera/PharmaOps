"use client";

import { useState, useCallback }   from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Receipt, Eye, SlidersHorizontal, FileDown, FileText,
} from "lucide-react";
import { format }                  from "date-fns";
import jsPDF                       from "jspdf";
import autoTable                   from "jspdf-autotable";
import APP_CONFIG                  from "@/lib/config";
import { DataTable, type Column }  from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { SearchBar }               from "@/components/common/SearchBar";
import { FilterBar }               from "@/components/common/FilterBar";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { useAuth }                 from "@/hooks/useAuth";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }               from "@/lib/toast";
import { formatDateTime, formatAmount } from "@/lib/utils";
import {
  SALE_STATUS_FILTER_OPTIONS, PAYMENT_METHOD_FILTER_OPTIONS,
  PAYMENT_METHOD_LABEL,
} from "@/lib/constants";
import { SALE_STATUS_VARIANT, PAYMENT_METHOD_VARIANT } from "@/lib/badges";
import { SaleViewModal }   from "../components/SaleViewModal";
import { SaleRefundModal } from "../components/SaleRefundModal";
import type { Sale, PaginatedResponse } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(sale: Sale): string[] {
  return [
    formatDateTime(sale.created_at),
    `#${sale.id.slice(-8).toUpperCase()}`,
    sale.customer_name || "Walk-in",
    sale.cashier_name,
    sale.source === "ORDER" ? "Order" : "POS",
    String(sale.items.length),
    `LKR ${formatAmount(sale.total_amount)}`,
    PAYMENT_METHOD_LABEL[sale.payment_method] ?? sale.payment_method,
    sale.status === "PARTIAL_REFUND" ? "Partial Refund" : sale.status === "REFUNDED" ? "Refunded" : "Completed",
  ];
}

function exportSelectedCsv(selected: Sale[]) {
  const header  = ["Date / Time", "Invoice ID", "Customer", "Cashier", "Source", "Items", "Total", "Payment", "Status"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `sales_invoices_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: Sale[]) {
  const doc  = new jsPDF();
  const head = [["Date / Time", "Invoice ID", "Customer", "Cashier", "Source", "Items", "Total", "Payment", "Status"]];
  const body = selected.map(buildRow);

  let cursorY = 14;
  try {
    const res     = await fetch(APP_CONFIG.orgLogo);
    const blob    = await res.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, "PNG", 14, cursorY, 12, 12);
    cursorY += 1;
  } catch {
    // Logo load failure is non-fatal
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
  cursorY += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Sales Invoices Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 7 } });

  doc.save(`sales_invoices_${exportDateStamp()}.pdf`);
}

export default function SalesInvoicesPage() {
  const { permissions } = useAuth();
  const canRefund       = permissions?.can("BRANCH_ADMIN") ?? false;

  const [statusFilter,        setStatusFilter]        = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [startDate,           setStartDate]           = useState("");
  const [endDate,             setEndDate]             = useState("");
  const [filterVisible,       setFilterVisible]       = useState(false);

  const [viewingSale,   setViewingSale]   = useState<Sale | null>(null);
  const [refundingSale, setRefundingSale] = useState<Sale | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // ── Row selection
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at" });

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

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Sale>>({
    queryKey:        ["sales", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<Sale>>("/sales/invoices", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const sales      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ── Selection helpers
  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = sales.map((s) => s.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = sales.filter((s) => selectedKeys.has(s.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ── Export handlers
  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter) exportParams.status = statusFilter;
        if (paymentMethodFilter) exportParams.payment_method = paymentMethodFilter;
        if (startDate) exportParams.start_date = startDate;
        if (endDate) exportParams.end_date = endDate;
        if (search) exportParams.search = search;
        const blob = await apiDownloadFile("/sales/invoices/export", exportParams);
        downloadBlob(blob, `sales_invoices_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems);
    }
  }

  function handleExportPdf() {
    exportSelectedPdf(selectedItems);
  }

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
      header: "Invoice ID",
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
      key:    "source",
      header: "Source",
      render: (row) => (
        <Badge variant={row.source === "ORDER" ? "info" : "default"}>
          {row.source === "ORDER" ? "Order" : "POS"}
        </Badge>
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
          LKR {formatAmount(row.total_amount)}
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Sales Invoices</h1>
          </div>
          <p className="page-subtitle mt-1">All completed sales transactions from POS and converted orders</p>
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
            placeholder="Search by customer, cashier…"
            onSearch={handleSearch}
            className="w-[26rem] max-w-full"
          />
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

        <DataTable<Sale>
          columns={columns}
          data={sales}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No invoices found matching "${search}"` : "No sales invoices recorded yet."}
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
              onPageSizeChange={changePageSize}

            />
          )}
        </div>

        {(selectedKeys.size > 0 || allPagesSelected) && (
          <div
            className="border-t flex items-center justify-between px-4 py-3 gap-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {selectionCount} record{selectionCount !== 1 ? "s" : ""} selected
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                leftIcon={<FileDown className="w-3.5 h-3.5" />}
                onClick={handleExportCsv}
                isLoading={isExportingCsv}
              >
                Export CSV
              </Button>
              {!allPagesSelected && (
                <Button
                  variant="outline" size="sm"
                  leftIcon={<FileText className="w-3.5 h-3.5" />}
                  onClick={handleExportPdf}
                >
                  Export PDF
                </Button>
              )}
              <button
                onClick={clearSelection}
                className="text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--color-surface)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

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
