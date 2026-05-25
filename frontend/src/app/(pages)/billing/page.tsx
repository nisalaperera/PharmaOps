"use client";

import { useState, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Wallet, Eye, CreditCard, RotateCcw, FileDown } from "lucide-react";
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
import { formatDateTime }          from "@/lib/utils";
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
import { SaleViewModal }       from "./components/SaleViewModal";
import { CreditPaymentModal }  from "./components/CreditPaymentModal";
import { RefundModal }         from "./components/RefundModal";
import type { Sale, PaginatedResponse, SaleStatus, PaymentMethod } from "@/types";

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

  // ── Export CSV ───────────────────────────────────────────────────────────────

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
          {s.total_amount.toFixed(2)}
        </span>
      ),
    },
    {
      key:    "payment_method",
      header: "Payment",
      render: (s) => (
        <Badge variant={PAYMENT_METHOD_VARIANT[s.payment_method] ?? "default"}>
          {PAYMENT_METHOD_LABEL[s.payment_method] ?? s.payment_method}
        </Badge>
      ),
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
          {s.payment_method === "CREDIT" && s.status === "COMPLETED" && s.customer_id && (
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

      {/* Table */}
      <DataTable
        data={sales}
        columns={columns}
        rowKey={(s) => s.id}
        isFetching={isFetching}
        sort={{ field: sort.field, direction: sort.direction }}
        onSort={handleSort}
        emptyMessage="No sales found."
      />

      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        pageSize={pagination.pageSize}
        totalRecords={totalCount}
        totalPages={data?.total_pages ?? 1}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
      />

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
