"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Upload, SlidersHorizontal, Eye, Trash2, FileDown, FileText, Network } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { StatusBadge }            from "@/components/ui/StatusBadge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { ImportModal }            from "@/components/common/ImportModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS, SUPPLIER_TYPE_FILTER_OPTIONS } from "@/lib/constants";
import { SUPPLIER_TYPE_VARIANT, SUPPLIER_TYPE_LABEL }          from "@/lib/badges";
import APP_CONFIG                 from "@/lib/config";
import { SupplierModal }           from "./components/SupplierModal";
import { SupplierViewModal }       from "./components/SupplierViewModal";
import { ChannelManagementModal }  from "./components/ChannelManagementModal";
import type { Supplier, SupplierType, PaginatedResponse, ImportResult } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function channelsCount(s: Supplier): number {
  return s.supplier_type === "AGENCY"
    ? s.agency_channels.length
    : s.distributor_channels.length;
}

function buildRow(s: Supplier): string[] {
  return [
    s.short_name,
    s.legal_name,
    SUPPLIER_TYPE_LABEL[s.supplier_type],
    s.registration_number ?? "",
    String(channelsCount(s)),
    s.is_active ? "Active" : "Inactive",
  ];
}

function exportSelectedCsv(selected: Supplier[]) {
  const header  = ["Short Name", "Legal Name", "Type", "Registration Number", "Channels", "Status"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `suppliers_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: Supplier[]) {
  const doc  = new jsPDF();
  const head = [["Short Name", "Legal Name", "Type", "Registration Number", "Channels", "Status"]];
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
    // Non-fatal logo load failure
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
  cursorY += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Supplier Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`suppliers_${exportDateStamp()}.pdf`);
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { permissions } = useAuth();
  const canManage = (permissions?.isAdmin || permissions?.isManager) ?? false;

  // — Filters
  const [statusFilter,       setStatusFilter]       = useState("");
  const [supplierTypeFilter, setSupplierTypeFilter] = useState<SupplierType | "">("");
  const [filterVisible,      setFilterVisible]      = useState(false);

  // — Modal state
  const [modalOpen,          setModalOpen]          = useState(false);
  const [editingSupplier,    setEditingSupplier]    = useState<Supplier | null>(null);
  const [viewSupplier,       setViewSupplier]       = useState<Supplier | null>(null);
  const [channelsSupplier,   setChannelsSupplier]   = useState<Supplier | null>(null);
  const [confirmSupplier,    setConfirmSupplier]    = useState<Supplier | null>(null);
  const [importOpen,         setImportOpen]         = useState(false);

  // — Row selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  // — Pagination
  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "short_name" });

  const filters = {
    ...(statusFilter       && { is_active:     statusFilter }),
    ...(supplierTypeFilter && { supplier_type: supplierTypeFilter }),
  };

  const hasActiveFilters  = statusFilter !== "" || supplierTypeFilter !== "";
  const activeFilterCount = (statusFilter ? 1 : 0) + (supplierTypeFilter ? 1 : 0);

  function clearFilters() {
    setStatusFilter("");
    setSupplierTypeFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // — Data
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<Supplier>>({
    queryKey: ["suppliers", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<Supplier>>("/suppliers", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // — Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: (supplier: Supplier) =>
      apiPatch<Supplier>(`/suppliers/${supplier.id}`, { is_active: !supplier.is_active }),
    onSuccess: (_, supplier) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast(
        "success",
        supplier.is_active ? "Supplier Deactivated" : "Supplier Activated",
        supplier.is_active
          ? `${supplier.short_name} has been deactivated.`
          : `${supplier.short_name} is now active.`,
      );
      setConfirmSupplier(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // — Selection helpers
  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = items.map((i) => i.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = items.filter((i) => selectedKeys.has(i.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // — Export handlers
  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter)       exportParams.is_active     = statusFilter;
        if (supplierTypeFilter) exportParams.supplier_type = supplierTypeFilter;
        if (search)             exportParams.search        = search;
        const blob = await apiDownloadFile("/suppliers/export", exportParams);
        downloadBlob(blob, `suppliers_${exportDateStamp()}.csv`);
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

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/suppliers/import", file);
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/suppliers/import/template");
    downloadBlob(blob, "suppliers_import_template.csv");
  }

  // — Columns
  const columns: Column<Supplier>[] = [
    {
      key:      "short_name",
      header:   "Supplier",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.short_name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {row.legal_name}
          </p>
        </div>
      ),
    },
    {
      key:      "supplier_type",
      header:   "Type",
      render:   (row) => (
        <Badge variant={SUPPLIER_TYPE_VARIANT[row.supplier_type]}>
          {SUPPLIER_TYPE_LABEL[row.supplier_type]}
        </Badge>
      ),
    },
    {
      key:    "channels",
      header: "Channels",
      render: (row) => {
        const count = channelsCount(row);
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setChannelsSupplier(row); }}
            className="text-sm tabular-nums hover:underline transition-colors text-left"
            style={{ color: count === 0 ? "var(--color-text-muted)" : "var(--color-primary)" }}
            title="Manage Channels"
          >
            {count === 0 ? "Add channels" : `${count} channel${count !== 1 ? "s" : ""}`}
          </button>
        );
      },
    },
    {
      key:    "is_active",
      header: "Status",
      render: (row) => <StatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "100px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewSupplier(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {canManage && (
            <>
              <button
                title="Manage Channels"
                onClick={(e) => { e.stopPropagation(); setChannelsSupplier(row); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Network className="w-3.5 h-3.5" />
              </button>
              <button
                title="Edit Supplier"
                onClick={(e) => { e.stopPropagation(); setEditingSupplier(row); setModalOpen(true); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                title={row.is_active ? "Deactivate Supplier" : "Activate Supplier"}
                onClick={(e) => { e.stopPropagation(); setConfirmSupplier(row); }}
                className={row.is_active
                  ? "p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  : "p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const isDeactivating = confirmSupplier?.is_active === true;

  return (
    <div className="page-container">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Supplier Management</h1>
          </div>
          <p className="page-subtitle mt-1">Manage agencies and distributors</p>
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
            placeholder="Search by name or registration…"
            onSearch={handleSearch}
            className="w-[28rem] max-w-full"
          />

          {canManage && (
            <div
              className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Button
                variant="primary"
                leftIcon={<Upload className="w-4 h-4" />}
                onClick={() => setImportOpen(true)}
              >
                Import
              </Button>
              <Button
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditingSupplier(null); setModalOpen(true); }}
              >
                New Supplier
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select
          value={supplierTypeFilter}
          onChange={(e) => { setSupplierTypeFilter(e.target.value as SupplierType | ""); goToPage(1); }}
          className="form-select w-auto"
        >
          {SUPPLIER_TYPE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {ACTIVE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      {/* ── Table card ────────────────────────────────────────────────────── */}
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

        <DataTable<Supplier>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No suppliers found matching "${search}"` : "No suppliers found."}
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

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <SupplierModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingSupplier(null); }}
        editingSupplier={editingSupplier}
      />

      <SupplierViewModal
        isOpen={!!viewSupplier}
        onClose={() => setViewSupplier(null)}
        supplier={viewSupplier}
      />

      <ChannelManagementModal
        isOpen={!!channelsSupplier}
        onClose={() => setChannelsSupplier(null)}
        supplier={channelsSupplier}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Suppliers"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required columns: short_name, legal_name. Optional: supplier_type (AGENCY/DISTRIBUTOR), registration_number"
      />

      <ConfirmModal
        isOpen={!!confirmSupplier}
        onClose={() => setConfirmSupplier(null)}
        title={isDeactivating ? "Deactivate Supplier" : "Activate Supplier"}
        body={
          isDeactivating ? (
            <>Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmSupplier?.short_name}
              </span>? Distributor channels will be hidden from purchase orders.
            </>
          ) : (
            <>Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmSupplier?.short_name}
              </span>?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmSupplier && toggleStatusMutation.mutate(confirmSupplier)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
