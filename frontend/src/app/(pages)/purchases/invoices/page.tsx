"use client";

import { useState, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  FileText, Plus, Eye, SlidersHorizontal,
  FileDown,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { GRN_STATUS_FILTER_OPTIONS, PURCHASE_INVOICE_PAYMENT_STATUS_FILTER_OPTIONS } from "@/lib/constants";
import {
  GRN_STATUS_VARIANT, GRN_STATUS_LABEL,
  PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT, PURCHASE_INVOICE_PAYMENT_STATUS_LABEL,
} from "@/lib/badges";
import APP_CONFIG                 from "@/lib/config";
import { PurchaseInvoiceModal }   from "./components/PurchaseInvoiceModal";
import { PurchaseInvoiceViewModal } from "./components/PurchaseInvoiceViewModal";
import type { PurchaseInvoice, Branch, PaginatedResponse } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(inv: PurchaseInvoice, branchNameMap: Record<string, string>): string[] {
  return [
    inv.invoice_number || `#${inv.id.slice(0, 8).toUpperCase()}`,
    `#${inv.purchase_order_id.slice(0, 8).toUpperCase()}`,
    branchNameMap[inv.branch_id] ?? inv.branch_id,
    inv.supplier_name,
    String(inv.items.length),
    inv.invoice_date?.slice(0, 10) ?? "",
    GRN_STATUS_LABEL[inv.status],
    PURCHASE_INVOICE_PAYMENT_STATUS_LABEL[inv.payment_status],
  ];
}

function exportSelectedCsv(selected: PurchaseInvoice[], branchNameMap: Record<string, string>) {
  const header  = ["Invoice #", "PO #", "Branch", "Supplier", "Items", "Invoice Date", "Status", "Payment"];
  const rows    = selected.map((inv) => buildRow(inv, branchNameMap));
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `purchase_invoices_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: PurchaseInvoice[], branchNameMap: Record<string, string>) {
  const doc  = new jsPDF();
  const head = [["Invoice #", "PO #", "Branch", "Supplier", "Items", "Invoice Date", "Status", "Payment"]];
  const body = selected.map((inv) => buildRow(inv, branchNameMap));

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
  doc.text("Purchase Invoices — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`purchase_invoices_${exportDateStamp()}.pdf`);
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function PurchaseInvoicesPage() {
  const { permissions } = useAuth();
  const canCreate = permissions?.can("BRANCH_USER") ?? false;

  const [statusFilter,        setStatusFilter]        = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [branchFilter,        setBranchFilter]        = useState("");
  const [filterVisible,       setFilterVisible]       = useState(false);

  const [modalOpen,  setModalOpen]  = useState(false);
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "received_at", initialSortDirection: "desc" });

  const filters = {
    ...(statusFilter        && { status:         statusFilter }),
    ...(paymentStatusFilter && { payment_status: paymentStatusFilter }),
    ...(branchFilter        && { branch_id:      branchFilter }),
  };

  const hasActiveFilters  = statusFilter !== "" || paymentStatusFilter !== "" || branchFilter !== "";
  const activeFilterCount = (statusFilter ? 1 : 0) + (paymentStatusFilter ? 1 : 0) + (branchFilter ? 1 : 0);

  function clearFilters() { setStatusFilter(""); setPaymentStatusFilter(""); setBranchFilter(""); goToPage(1); }
  function hideFilters()  { clearFilters(); setFilterVisible(false); }

  const { data, isLoading } = useQuery<PaginatedResponse<PurchaseInvoice>>({
    queryKey: ["purchase-invoices", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<PurchaseInvoice>>("/purchases/invoices", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches-select"],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { page_size: 200 }),
    enabled:  permissions?.isOrgLevel ?? false,
  });
  const branches      = branchesData?.data ?? [];
  const branchNameMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = items.map((i) => i.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = items.filter((i) => selectedKeys.has(i.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter)        exportParams.status         = statusFilter;
        if (paymentStatusFilter) exportParams.payment_status = paymentStatusFilter;
        if (branchFilter)        exportParams.branch_id      = branchFilter;
        if (search)              exportParams.search         = search;
        const blob = await apiDownloadFile("/purchases/invoices/export", exportParams);
        downloadBlob(blob, `purchase_invoices_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems, branchNameMap);
    }
  }

  async function handleExportPdf() {
    await exportSelectedPdf(selectedItems, branchNameMap);
  }

  const columns: Column<PurchaseInvoice>[] = [
    {
      key:    "invoice_number",
      header: "Invoice #",
      render: (row) => (
        <span className="text-sm font-mono font-semibold" style={{ color: "var(--color-text)" }}>
          {row.invoice_number || `#${row.id.slice(0, 8).toUpperCase()}`}
        </span>
      ),
    },
    {
      key:    "purchase_order_id",
      header: "Purchase Order",
      render: (row) => (
        <span className="text-sm font-mono" style={{ color: "var(--color-text-muted)" }}>
          #{row.purchase_order_id.slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    ...(permissions?.isOrgLevel ? [{
      key:    "branch_id",
      header: "Branch",
      render: (row: PurchaseInvoice) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {branchNameMap[row.branch_id] ?? row.branch_id}
        </span>
      ),
    }] as Column<PurchaseInvoice>[] : []),
    {
      key:      "supplier_name",
      header:   "Supplier",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.supplier_name || "—"}
          </p>
          {row.channel_name && (
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {row.channel_name}
            </p>
          )}
        </div>
      ),
    },
    {
      key:    "items",
      header: "Items",
      render: (row) => (
        <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {row.items.length} item{row.items.length !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key:      "invoice_date",
      header:   "Invoice Date",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.invoice_date?.slice(0, 10) ?? "—"}
        </span>
      ),
    },
    {
      key:      "status",
      header:   "Status",
      sortable: true,
      render:   (row) => (
        <Badge variant={GRN_STATUS_VARIANT[row.status]}>
          {GRN_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key:      "payment_status",
      header:   "Payment",
      sortable: true,
      render:   (row) => (
        <Badge variant={PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT[row.payment_status]}>
          {PURCHASE_INVOICE_PAYMENT_STATUS_LABEL[row.payment_status]}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "72px",
      render: (row) => (
        <button
          title="View Details"
          onClick={(e) => { e.stopPropagation(); setViewInvoice(row); }}
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Purchase Invoices</h1>
          </div>
          <p className="page-subtitle mt-1">Record and track purchase invoices against approved orders</p>
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
            placeholder="Search by supplier…"
            onSearch={handleSearch}
            className="w-[26rem] max-w-full"
          />

          {canCreate && (
            <div className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0" style={{ borderColor: "var(--color-border)" }}>
              <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>
                New Invoice
              </Button>
            </div>
          )}
        </div>
      </div>

      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }} className="form-select w-auto">
          {GRN_STATUS_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <select value={paymentStatusFilter} onChange={(e) => { setPaymentStatusFilter(e.target.value); goToPage(1); }} className="form-select w-auto">
          {PURCHASE_INVOICE_PAYMENT_STATUS_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        {permissions?.isOrgLevel && (
          <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); goToPage(1); }} className="form-select w-auto">
            <option value="">All Branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        {showSelectAllBanner && (
          <div className="px-4 py-2 text-sm text-center border-b" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
            <span style={{ color: "var(--color-text-muted)" }}>{pagination.pageSize} records on this page are selected. </span>
            <button onClick={handleSelectAllPages} className="font-semibold text-primary-500 hover:underline">
              Select all {totalItems} records
            </button>
          </div>
        )}

        {allPagesSelected && (
          <div className="px-4 py-2 text-sm text-center border-b" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
            <span className="font-semibold text-primary-500">All {totalItems} records selected.</span>{" "}
            <button onClick={clearSelection} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>Clear selection</button>
          </div>
        )}

        <DataTable<PurchaseInvoice>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No purchase invoices found matching "${search}"` : "No purchase invoices found."}
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
          <div className="border-t flex items-center justify-between px-4 py-3 gap-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {selectionCount} record{selectionCount !== 1 ? "s" : ""} selected
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" leftIcon={<FileDown className="w-3.5 h-3.5" />} onClick={handleExportCsv} isLoading={isExportingCsv}>
                Export CSV
              </Button>
              {!allPagesSelected && (
                <Button variant="outline" size="sm" leftIcon={<FileText className="w-3.5 h-3.5" />} onClick={handleExportPdf}>
                  Export PDF
                </Button>
              )}
              <button onClick={clearSelection} className="text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--color-surface)]" style={{ color: "var(--color-text-muted)" }}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      <PurchaseInvoiceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      <PurchaseInvoiceViewModal
        isOpen={!!viewInvoice}
        onClose={() => setViewInvoice(null)}
        invoice={viewInvoice}
        branchNameMap={branchNameMap}
      />
    </div>
  );
}
