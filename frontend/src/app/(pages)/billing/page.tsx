"use client";

import { useState, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Wallet, Eye, CreditCard, RotateCcw, FileDown, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
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
  SALE_STATUS_FILTER_OPTIONS,
  PAYMENT_METHOD_FILTER_OPTIONS,
  PAYMENT_METHOD_LABEL,
  SALE_STATUS_LABEL,
} from "@/lib/constants";
import {
  PAYMENT_METHOD_VARIANT,
  SALE_STATUS_VARIANT,
} from "@/lib/badges";
import APP_CONFIG                  from "@/lib/config";
import { SaleViewModal }       from "./components/SaleViewModal";
import { CreditPaymentModal }  from "./components/CreditPaymentModal";
import { RefundModal }         from "./components/RefundModal";
import type { Sale, PaginatedResponse, SaleStatus, PaymentMethod } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

const CSV_HEADERS = ["Date", "Customer", "Cashier", "Total", "Payment Method", "Status"];

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(sale: Sale): string[] {
  return [
    formatDateTime(sale.created_at),
    sale.customer_name || "Walk-in",
    sale.cashier_name,
    formatAmount(sale.total_amount),
    PAYMENT_METHOD_LABEL[sale.payment_method] ?? sale.payment_method,
    SALE_STATUS_LABEL[sale.status] ?? sale.status,
  ];
}

function exportSelectedCsv(selected: Sale[]) {
  const rows    = selected.map(buildRow);
  const csvText = [CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(
    new Blob([csvText], { type: "text/csv;charset=utf-8;" }),
    `sales_${exportDateStamp()}.csv`,
  );
}

async function exportSelectedPdf(selected: Sale[]) {
  const doc  = new jsPDF();
  const head = [CSV_HEADERS];
  const body = selected.map(buildRow);

  let cursorY = 14;
  try {
    const res     = await fetch(APP_CONFIG.orgLogo);
    const blob    = await res.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader  = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, "PNG", 14, cursorY, 12, 12);
    cursorY += 1;
  } catch {
    // Logo load failure is non-fatal — continue without it.
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
  cursorY += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Sales Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });

  doc.save(`sales_${exportDateStamp()}.pdf`);
}

// ─── Filters ──────────────────────────────────────────────────────────────────

interface BillingFilters {
  branchId:      string;
  paymentMethod: PaymentMethod | "";
  saleStatus:    SaleStatus | "";
}

const DEFAULT_FILTERS: BillingFilters = {
  branchId:      "",
  paymentMethod: "",
  saleStatus:    "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, permissions } = useAuth();

  const [filters, setFilters]         = useState<BillingFilters>(DEFAULT_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);

  const [viewSale, setViewSale]         = useState<Sale | null>(null);
  const [creditSale, setCreditSale]     = useState<Sale | null>(null);
  const [refundSale, setRefundSale]     = useState<Sale | null>(null);

  // — Selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at", initialSortDirection: "desc" });

  const effectiveBranchId =
    permissions?.isOrgLevel ? filters.branchId : (user?.branchId ?? "");

  const queryArgs = {
    ...queryParams,
    branch_id:      effectiveBranchId || undefined,
    payment_method: filters.paymentMethod || undefined,
    status:         filters.saleStatus || undefined,
  };

  const { data, isFetching } = useQuery({
    queryKey:    ["sales", queryArgs],
    queryFn:     () => apiGet<PaginatedResponse<Sale>>("/sales/invoices", queryArgs),
    placeholderData: keepPreviousData,
  });

  const sales      = data?.data ?? [];
  const totalCount = data?.total ?? 0;

  // ── Filters helpers ──────────────────────────────────────────────────────────

  const hasActiveFilters =
    filters.branchId !== "" ||
    filters.paymentMethod !== "" ||
    filters.saleStatus !== "";

  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  // ── Export all CSV ──────────────────────────────────────────────────────────

  async function handleExport() {
    try {
      const blob = await apiDownloadFile("/sales/invoices/export", {
        branch_id:      effectiveBranchId || undefined,
        payment_method: filters.paymentMethod || undefined,
        status:         filters.saleStatus || undefined,
        search:         search || undefined,
      });
      downloadBlob(blob, `sales_${format(new Date(), "yyyy-MM-dd")}.csv`);
      showToast("success", "Export ready", "Sales data has been downloaded.");
    } catch {
      showToast("error", "Export failed", "Could not download the sales data.");
    }
  }

  // ── Selection ────────────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = sales.map((s) => s.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalCount > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = sales.filter((s) => selectedKeys.has(s.id));
  const selectionCount = allPagesSelected ? totalCount : selectedKeys.size;

  // ── Selection export handlers ────────────────────────────────────────────────

  async function handleExportSelectedCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const blob = await apiDownloadFile("/sales/invoices/export", {
          branch_id:      effectiveBranchId || undefined,
          payment_method: filters.paymentMethod || undefined,
          status:         filters.saleStatus || undefined,
          search:         search || undefined,
        });
        downloadBlob(blob, `sales_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems);
    }
  }

  async function handleExportPdf() {
    await exportSelectedPdf(selectedItems);
  }

  // ── Columns ──────────────────────────────────────────────────────────────────

  const columns: Column<Sale>[] = [
    {
      key:       "created_at",
      header:    "Date",
      sortable:  true,
      render:    (s) => (
        <span className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
          {formatDateTime(s.created_at)}
        </span>
      ),
    },
    {
      key:    "customer_name",
      header: "Customer",
      render: (s) =>
        s.customer_name ? (
          <span style={{ color: "var(--color-text)" }}>{s.customer_name}</span>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>Walk-in</span>
        ),
    },
    {
      key:    "cashier_name",
      header: "Cashier",
      render: (s) => <span style={{ color: "var(--color-text)" }}>{s.cashier_name}</span>,
    },
    {
      key:      "total_amount",
      header:   "Total",
      sortable: true,
      render:   (s) => (
        <span className="tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>
          {formatAmount(s.total_amount)}
        </span>
      ),
    },
    {
      key:    "payment_method",
      header: "Payment",
      render: (s) => {
        const creditDue = (s.credit_amount || s.total_amount) - (s.credit_settled_amount ?? 0);
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant={PAYMENT_METHOD_VARIANT[s.payment_method] ?? "default"}>
              {PAYMENT_METHOD_LABEL[s.payment_method] ?? s.payment_method}
            </Badge>
            {s.payment_method === "CREDIT" && (
              s.credit_settled || creditDue <= 0 ? (
                <Badge variant="success">Settled</Badge>
              ) : (
                <Badge variant="danger">Due {formatAmount(creditDue)}</Badge>
              )
            )}
          </div>
        );
      },
    },
    {
      key:    "status",
      header: "Status",
      render: (s) => (
        <Badge variant={SALE_STATUS_VARIANT[s.status] ?? "default"} dot>
          {SALE_STATUS_LABEL[s.status] ?? s.status}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "",
      render: (s) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Eye className="w-3.5 h-3.5" />}
            onClick={() => setViewSale(s)}
          >
            View
          </Button>
          {s.payment_method === "CREDIT" && s.status === "COMPLETED" && s.customer_id && !s.credit_settled && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<CreditCard className="w-3.5 h-3.5" />}
              onClick={() => setCreditSale(s)}
            >
              Pay
            </Button>
          )}
          {s.status === "COMPLETED" && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => setRefundSale(s)}
            >
              Refund
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="page-icon">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="page-title">Billing &amp; Payments</h1>
            <p className="page-subtitle">Sales ledger and credit payment management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            leftIcon={<FileDown className="w-4 h-4" />}
            onClick={handleExport}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <SearchBar
          defaultValue={search}
          onSearch={handleSearch}
          placeholder="Search patient or cashier…"
        />
        <Button
          variant={filterVisible ? "primary" : "ghost"}
          onClick={() => setFilterVisible((v) => !v)}
        >
          Filters {hasActiveFilters && `(${[filters.branchId, filters.paymentMethod, filters.saleStatus].filter(Boolean).length})`}
        </Button>
      </div>

      {/* FilterBar */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={() => setFilterVisible(false)}
      >
        {permissions?.isOrgLevel && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Branch ID</label>
            <input
              type="text"
              className="form-input text-sm"
              placeholder="All branches"
              value={filters.branchId}
              onChange={(e) => setFilters((f) => ({ ...f, branchId: e.target.value }))}
              style={{ width: 180 }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Payment Method</label>
          <select
            className="form-select text-sm"
            value={filters.paymentMethod}
            onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value as PaymentMethod | "" }))}
            style={{ width: 160 }}
          >
            {PAYMENT_METHOD_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Status</label>
          <select
            className="form-select text-sm"
            value={filters.saleStatus}
            onChange={(e) => setFilters((f) => ({ ...f, saleStatus: e.target.value as SaleStatus | "" }))}
            style={{ width: 160 }}
          >
            {SALE_STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
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
              Select all {totalCount} records
            </button>
          </div>
        )}

        {allPagesSelected && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span className="font-semibold text-primary-500">All {totalCount} records selected.</span>{" "}
            <button onClick={clearSelection} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
              Clear selection
            </button>
          </div>
        )}

        <DataTable<Sale>
          data={sales}
          columns={columns}
          rowKey={(s) => s.id}
          isFetching={isFetching}
          sort={{ field: sort.field, direction: sort.direction }}
          onSort={handleSort}
          emptyMessage="No sales found."
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
        />

        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          <Pagination
            currentPage={pagination.page}
            pageSize={pagination.pageSize}
            totalRecords={totalCount}
            totalPages={data?.total_pages ?? 1}
            onPageChange={goToPage}
            onPageSizeChange={changePageSize}
          />
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
                variant="outline"
                size="sm"
                leftIcon={<FileDown className="w-3.5 h-3.5" />}
                onClick={handleExportSelectedCsv}
                isLoading={isExportingCsv}
              >
                Export CSV
              </Button>
              {!allPagesSelected && (
                <Button
                  variant="outline"
                  size="sm"
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

      {/* Modals */}
      <SaleViewModal
        sale={viewSale}
        onClose={() => setViewSale(null)}
      />

      <CreditPaymentModal
        sale={creditSale}
        branchId={effectiveBranchId}
        onClose={() => setCreditSale(null)}
      />

      <RefundModal
        sale={refundSale}
        onClose={() => setRefundSale(null)}
      />

    </div>
  );
}
