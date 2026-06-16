"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  FileText, Plus, Eye, Pencil, Trash2, CreditCard, SlidersHorizontal,
  FileDown,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiDelete, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { PURCHASE_INVOICE_STATUS_FILTER_OPTIONS, PURCHASE_INVOICE_PAYMENT_STATUS_FILTER_OPTIONS } from "@/lib/constants";
import {
  PURCHASE_INVOICE_STATUS_VARIANT, PURCHASE_INVOICE_STATUS_LABEL,
  PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT, PURCHASE_INVOICE_PAYMENT_STATUS_LABEL,
} from "@/lib/badges";
import APP_CONFIG                 from "@/lib/config";
import { PurchaseInvoiceModal }   from "./components/PurchaseInvoiceModal";
import { PurchaseInvoiceViewModal } from "./components/PurchaseInvoiceViewModal";
import { MultiPaymentModal }      from "./components/MultiPaymentModal";
import type { PurchaseInvoice, Branch, PaginatedResponse } from "@/types";

function lkr(n: number): string {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(inv: PurchaseInvoice, branchNameMap: Record<string, string>): string[] {
  return [
    inv.invoice_number,
    inv.invoice_date?.slice(0, 10) ?? "",
    branchNameMap[inv.branch_id] ?? inv.branch_id,
    inv.supplier_name,
    inv.channel_name,
    lkr(inv.total_amount),
    lkr(inv.return_amount),
    lkr(inv.net_amount),
    PURCHASE_INVOICE_STATUS_LABEL[inv.status],
    PURCHASE_INVOICE_PAYMENT_STATUS_LABEL[inv.payment_status],
  ];
}

function exportSelectedCsv(selected: PurchaseInvoice[], branchNameMap: Record<string, string>) {
  const header  = ["Invoice #", "Invoice Date", "Branch", "Supplier", "Channel", "Total", "Return", "Net", "Status", "Payment"];
  const rows    = selected.map((inv) => buildRow(inv, branchNameMap));
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `purchase_invoices_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: PurchaseInvoice[], branchNameMap: Record<string, string>) {
  const doc  = new jsPDF();
  const head = [["Invoice #", "Invoice Date", "Branch", "Supplier", "Channel", "Total", "Return", "Net", "Status", "Payment"]];
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
  const queryClient = useQueryClient();
  const canCreate = permissions?.can("BRANCH_USER") ?? false;
  const canDelete = permissions?.can("BRANCH_MANAGER") ?? false;

  const [statusFilter,        setStatusFilter]        = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [branchFilter,        setBranchFilter]        = useState("");
  const [filterVisible,       setFilterVisible]       = useState(false);

  const [modalOpen,    setModalOpen]    = useState(false);
  const [editInvoice,  setEditInvoice]  = useState<PurchaseInvoice | null>(null);
  const [viewInvoice,  setViewInvoice]  = useState<PurchaseInvoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseInvoice | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at", initialSortDirection: "desc" });

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/purchases/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      showToast("success", "Invoice Deleted", "The purchase invoice has been removed.");
      setDeleteTarget(null);
    },
    onError: (err: { message?: string }) => showToast("error", "Delete Failed", err?.message ?? "Something went wrong."),
  });

  function openEdit(inv: PurchaseInvoice) { setEditInvoice(inv); setModalOpen(true); }

  const columns: Column<PurchaseInvoice>[] = [
    {
      key:    "invoice_number",
      header: "Invoice #",
      render: (row) => (
        <span className="text-sm font-mono font-semibold" style={{ color: "var(--color-text)" }}>
          {row.invoice_number}
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
      key:      "net_amount",
      header:   "Net (LKR)",
      sortable: true,
      render:   (row) => (
        <span className="text-sm tabular-nums font-semibold block text-right" style={{ color: "var(--color-text)" }}>
          {lkr(row.net_amount)}
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
        <Badge variant={PURCHASE_INVOICE_STATUS_VARIANT[row.status]}>
          {PURCHASE_INVOICE_STATUS_LABEL[row.status]}
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
      width:  "140px",
      render: (row) => {
        const isLocked = row.status === "VERIFIED";
        return (
          <div className="flex items-center gap-1">
            <button
              title="View Details"
              onClick={(e) => { e.stopPropagation(); setViewInvoice(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            {canCreate && !isLocked && (
              <button
                title="Edit"
                onClick={(e) => { e.stopPropagation(); openEdit(row); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDelete && !isLocked && row.paid_amount <= 0 && (
              <button
                title="Delete"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
                className="p-1.5 rounded-md transition-colors hover:bg-danger-50 dark:hover:bg-danger-900/20 text-danger-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      },
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
          <p className="page-subtitle mt-1">View, search, and manage purchase invoices. Create new invoices from the GRN page.</p>
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
              <Link href="/purchases/grn">
                <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
                  New Invoice
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }} className="form-select w-auto">
          {PURCHASE_INVOICE_STATUS_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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
              {canCreate && !allPagesSelected && selectedItems.some((i) => i.net_amount - i.paid_amount > 0.001) && (
                <Button variant="primary" size="sm" leftIcon={<CreditCard className="w-3.5 h-3.5" />} onClick={() => setPayModalOpen(true)}>
                  Record Payment
                </Button>
              )}
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
        editing={editInvoice}
      />

      <PurchaseInvoiceViewModal
        isOpen={!!viewInvoice}
        onClose={() => setViewInvoice(null)}
        invoice={viewInvoice}
        branchNameMap={branchNameMap}
      />

      <MultiPaymentModal
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        invoices={selectedItems}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Purchase Invoice"
        body={`Are you sure you want to delete invoice ${deleteTarget?.invoice_number}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
