"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ruler, Plus, Pencil, Trash2, Eye, Upload, FileDown, FileText, SlidersHorizontal } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable, type Column } from "@/components/common/DataTable";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Pagination }             from "@/components/common/Pagination";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { StatusBadge }            from "@/components/ui/StatusBadge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { ImportModal }            from "@/components/common/ImportModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS, SKU_TYPE_FILTER_OPTIONS } from "@/lib/constants";
import { SKU_TYPE_VARIANT }       from "@/lib/badges";
import APP_CONFIG                 from "@/lib/config";
import { SkuModal }               from "./components/SkuModal";
import { SkuViewModal }           from "./components/SkuViewModal";
import type { ProductSku, ImportResult } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function buildSkuRow(sku: ProductSku): string[] {
  return [sku.name, sku.plural || "", sku.sku_type, sku.is_active ? "TRUE" : "FALSE"];
}

function exportSkusCsv(skus: ProductSku[]) {
  const header  = ["name", "plural", "sku_type", "is_active"];
  const rows    = skus.map(buildSkuRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `skus_${exportDateStamp()}.csv`);
}

function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function exportSkusPdf(skus: ProductSku[]) {
  const doc     = new jsPDF();
  const headers = [["SKU Name", "Plural", "Type", "Status"]];
  const body    = skus.map(buildSkuRow);

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
    // Logo load failure is non-fatal — continue without it.
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
  cursorY += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`SKUs Report — ${exportDateStamp()}`, 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head: headers, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`skus_${exportDateStamp()}.pdf`);
}

// ─── SKUs page ────────────────────────────────────────────────────────────────

export default function SkusPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.isAdmin || permissions?.isManager;
  const queryClient     = useQueryClient();

  const [typeFilter,       setTypeFilter]       = useState("");
  const [statusFilter,     setStatusFilter]     = useState("");

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch } =
    usePagination({ initialSortField: "name" });
  const [filterVisible,    setFilterVisible]    = useState(false);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [editingSku,       setEditingSku]       = useState<ProductSku | null>(null);
  const [viewSku,          setViewSku]          = useState<ProductSku | null>(null);
  const [confirmSku,       setConfirmSku]       = useState<ProductSku | null>(null);
  const [importOpen,       setImportOpen]       = useState(false);
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  const { data: skus = [], isLoading } = useQuery<ProductSku[]>({
    queryKey: ["skus"],
    queryFn:  () => apiGet<ProductSku[]>("/products/skus"),
  });

  // ─── Client-side filter, search, and sort ────────────────────────────────────

  const filteredSkus = useMemo(() => {
    const q        = search.toLowerCase();
    const filtered = skus.filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(q) ||
        (s.plural ?? "").toLowerCase().includes(q);
      const matchesType   = !typeFilter   || s.sku_type === typeFilter;
      const matchesStatus =
        statusFilter === ""     ? true :
        statusFilter === "true" ? s.is_active :
                                  !s.is_active;
      return matchesSearch && matchesType && matchesStatus;
    });
    return [...filtered].sort((a, b) => {
      const aVal = String((a as unknown as Record<string, unknown>)[sort.field] ?? "").toLowerCase();
      const bVal = String((b as unknown as Record<string, unknown>)[sort.field] ?? "").toLowerCase();
      return sort.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [skus, search, typeFilter, statusFilter, sort]);

  const totalItems = filteredSkus.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  const pagedSkus  = filteredSkus.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);

  const hasActiveFilters  = typeFilter !== "" || statusFilter !== "";
  const activeFilterCount = (typeFilter ? 1 : 0) + (statusFilter ? 1 : 0);

  function clearFilters() {
    setTypeFilter("");
    setStatusFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // ─── Selection ───────────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = pagedSkus.map((s) => s.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = filteredSkus.filter((s) => selectedKeys.has(s.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ─── Export ──────────────────────────────────────────────────────────────────

  function handleExportCsv() {
    exportSkusCsv(allPagesSelected ? filteredSkus : selectedItems);
  }

  async function handleExportPdf() {
    await exportSkusPdf(selectedItems);
  }

  // ─── Toggle status mutation ──────────────────────────────────────────────────

  const toggleStatusMutation = useMutation({
    mutationFn: (sku: ProductSku) =>
      apiPatch<ProductSku>(`/products/skus/${sku.id}`, { is_active: !sku.is_active }),
    onSuccess: (_, sku) => {
      queryClient.invalidateQueries({ queryKey: ["skus"] });
      showToast(
        "success",
        sku.is_active ? "SKU Deactivated" : "SKU Activated",
        sku.is_active
          ? `${sku.name} has been deactivated.`
          : `${sku.name} is now active.`
      );
      setConfirmSku(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  // ─── Import ──────────────────────────────────────────────────────────────────

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/products/skus/import", file);
    queryClient.invalidateQueries({ queryKey: ["skus"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/products/skus/import/template");
    downloadBlob(blob, "skus_import_template.csv");
  }

  // ─── Columns ─────────────────────────────────────────────────────────────────

  const columns: Column<ProductSku>[] = [
    {
      key:      "name",
      header:   "SKU Name",
      sortable: true,
      render:   (row) => (
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          {row.name}
        </p>
      ),
    },
    {
      key:    "plural",
      header: "Plural",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.plural || "—"}
        </span>
      ),
    },
    {
      key:      "sku_type",
      header:   "Type",
      sortable: true,
      render:   (row) => (
        <Badge variant={SKU_TYPE_VARIANT[row.sku_type]}>
          {row.sku_type.charAt(0) + row.sku_type.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key:      "is_active",
      header:   "Status",
      sortable: true,
      render:   (row) => (
        <StatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "100px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewSku(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <>
              <button
                title="Edit SKU"
                onClick={(e) => { e.stopPropagation(); setEditingSku(row); setModalOpen(true); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                title={row.is_active ? "Deactivate SKU" : "Activate SKU"}
                onClick={(e) => { e.stopPropagation(); setConfirmSku(row); }}
                className={
                  row.is_active
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

  const isDeactivating = confirmSku?.is_active === true;

  return (
    <div className="page-container">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Ruler className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">SKUs</h1>
          </div>
          <p className="page-subtitle mt-1">
            Manage stock keeping units for pharmacy products
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
          <SearchBar
            placeholder="Search by name or plural…"
            onSearch={handleSearch}
            className="w-[22rem] max-w-full"
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
                onClick={() => { setEditingSku(null); setModalOpen(true); }}
              >
                New SKU
              </Button>
            </div>
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
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {SKU_TYPE_FILTER_OPTIONS.map((opt) => (
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

      {/* Table card */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>

        {/* Select-all-pages banner */}
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

        <DataTable<ProductSku>
          columns={columns}
          data={pagedSkus}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={
            search || hasActiveFilters
              ? "No SKUs found matching the current filters."
              : "No SKUs found. Add one to get started."
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
              onPageSizeChange={changePageSize}

            />
          )}
        </div>

        {/* Export footer */}
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
                onClick={handleExportCsv}
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

      <SkuModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingSku(null); }}
        editingSku={editingSku}
      />

      <SkuViewModal
        isOpen={!!viewSku}
        onClose={() => setViewSku(null)}
        sku={viewSku}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="SKUs"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required: name, sku_type (COUNT / VOLUME / WEIGHT / LENGTH). Optional: plural, is_active (TRUE/FALSE, default TRUE)."
      />

      <ConfirmModal
        isOpen={!!confirmSku}
        onClose={() => setConfirmSku(null)}
        title={isDeactivating ? "Deactivate SKU" : "Activate SKU"}
        body={
          isDeactivating ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmSku?.name}
              </span>
              ? It will be hidden from product forms.
            </>
          ) : (
            <>
              Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmSku?.name}
              </span>
              ?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmSku && toggleStatusMutation.mutate(confirmSku)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
