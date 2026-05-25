"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Plus, Pencil, Eye, Trash2, Upload, FileDown, FileText, SlidersHorizontal } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable, type Column } from "@/components/common/DataTable";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Pagination }             from "@/components/common/Pagination";
import { Button }                 from "@/components/ui/Button";
import { StatusBadge }            from "@/components/ui/StatusBadge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { ImportModal }            from "@/components/common/ImportModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS }  from "@/lib/constants";
import APP_CONFIG                 from "@/lib/config";
import { GenericModal }           from "./components/GenericModal";
import { GenericViewModal }       from "./components/GenericViewModal";
import type { ProductGeneric, ImportResult } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function buildGenericRow(generic: ProductGeneric): string[] {
  return [generic.name, generic.description ?? ""];
}

function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function exportGenericsCsv(generics: ProductGeneric[]) {
  const header  = ["name", "description"];
  const rows    = generics.map(buildGenericRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `generics_${exportDateStamp()}.csv`);
}

async function exportGenericsPdf(generics: ProductGeneric[]) {
  const doc     = new jsPDF();
  const headers = [["Generic Name", "Description"]];
  const body    = generics.map(buildGenericRow);

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
  doc.text(`Generics Report — ${exportDateStamp()}`, 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head: headers, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`generics_${exportDateStamp()}.pdf`);
}

// ─── Generics page ────────────────────────────────────────────────────────────

export default function GenericsPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.isAdmin || permissions?.isManager;
  const queryClient     = useQueryClient();

  const [statusFilter,     setStatusFilter]     = useState("");
  const [filterVisible,    setFilterVisible]    = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch } =
    usePagination({ initialSortField: "name" });
  const [modalOpen,        setModalOpen]        = useState(false);
  const [editingGeneric,   setEditingGeneric]   = useState<ProductGeneric | null>(null);
  const [viewGeneric,      setViewGeneric]      = useState<ProductGeneric | null>(null);
  const [confirmGeneric,   setConfirmGeneric]   = useState<ProductGeneric | null>(null);
  const [importOpen,       setImportOpen]       = useState(false);
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  const { data: generics = [], isLoading } = useQuery<ProductGeneric[]>({
    queryKey: ["generics"],
    queryFn:  () => apiGet<ProductGeneric[]>("/products/generics"),
  });

  const hasActiveFilters  = statusFilter !== "";
  const activeFilterCount = statusFilter ? 1 : 0;

  function clearFilters() { setStatusFilter(""); goToPage(1); }
  function hideFilters()  { clearFilters(); setFilterVisible(false); }

  const filteredGenerics = useMemo(() => {
    const q        = search.toLowerCase();
    const filtered = generics.filter((g) => {
      const matchesSearch =
        !search ||
        g.name.toLowerCase().includes(q) ||
        (g.description?.toLowerCase().includes(q) ?? false);
      const matchesStatus =
        statusFilter === ""      ? true :
        statusFilter === "true"  ? g.is_active :
                                   !g.is_active;
      return matchesSearch && matchesStatus;
    });
    return [...filtered].sort((a, b) => {
      const aVal = String((a as unknown as Record<string, unknown>)[sort.field] ?? "").toLowerCase();
      const bVal = String((b as unknown as Record<string, unknown>)[sort.field] ?? "").toLowerCase();
      return sort.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [generics, search, statusFilter, sort]);

  const totalItems    = filteredGenerics.length;
  const totalPages    = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  const pagedGenerics = filteredGenerics.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);

  // ─── Selection ───────────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = pagedGenerics.map((g) => g.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = filteredGenerics.filter((g) => selectedKeys.has(g.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ─── Export ──────────────────────────────────────────────────────────────────

  function handleExportCsv() {
    exportGenericsCsv(allPagesSelected ? filteredGenerics : selectedItems);
  }

  async function handleExportPdf() {
    await exportGenericsPdf(selectedItems);
  }

  // ─── Toggle status mutation ──────────────────────────────────────────────────

  const toggleStatusMutation = useMutation({
    mutationFn: (generic: ProductGeneric) =>
      apiPatch<ProductGeneric>(`/products/generics/${generic.id}`, { is_active: !generic.is_active }),
    onSuccess: (_, generic) => {
      queryClient.invalidateQueries({ queryKey: ["generics"] });
      showToast(
        "success",
        generic.is_active ? "Generic Deactivated" : "Generic Activated",
        generic.is_active
          ? `${generic.name} has been deactivated.`
          : `${generic.name} is now active.`
      );
      setConfirmGeneric(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  // ─── Import ──────────────────────────────────────────────────────────────────

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/products/generics/import", file);
    queryClient.invalidateQueries({ queryKey: ["generics"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/products/generics/import/template");
    downloadBlob(blob, "generics_import_template.csv");
  }

  // ─── Columns ─────────────────────────────────────────────────────────────────

  const columns: Column<ProductGeneric>[] = [
    {
      key:      "name",
      header:   "Generic Name",
      sortable: true,
      render:   (row) => (
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          {row.name}
        </p>
      ),
    },
    {
      key:      "description",
      header:   "Description",
      sortable: true,
      render:   (row) => (
        <p className="text-sm truncate max-w-[400px]" style={{ color: "var(--color-text-muted)" }}>
          {row.description || "—"}
        </p>
      ),
    },
    {
      key:    "is_active",
      header: "Status",
      width:  "100px",
      render: (row) => <StatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "120px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewGeneric(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <>
              <button
                title="Edit Generic"
                onClick={(e) => { e.stopPropagation(); setEditingGeneric(row); setModalOpen(true); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                title={row.is_active ? "Deactivate Generic" : "Activate Generic"}
                onClick={(e) => { e.stopPropagation(); setConfirmGeneric(row); }}
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

  const isDeactivating = confirmGeneric?.is_active === true;

  return (
    <div className="page-container">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Generics</h1>
          </div>
          <p className="page-subtitle mt-1">
            Manage generic drug names used across the product catalog
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
            placeholder="Search generics…"
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
                onClick={() => { setEditingGeneric(null); setModalOpen(true); }}
              >
                New Generic
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

        <DataTable<ProductGeneric>
          columns={columns}
          data={pagedGenerics}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={
            search || hasActiveFilters
              ? "No generics found matching the current filters."
              : "No generics found. Add one to get started."
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

      <GenericModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingGeneric(null); }}
        editingGeneric={editingGeneric}
      />

      <GenericViewModal
        isOpen={!!viewGeneric}
        onClose={() => setViewGeneric(null)}
        generic={viewGeneric}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Generics"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required: name. Optional: description."
      />

      <ConfirmModal
        isOpen={!!confirmGeneric}
        onClose={() => setConfirmGeneric(null)}
        title={isDeactivating ? "Deactivate Generic" : "Activate Generic"}
        body={
          isDeactivating ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmGeneric?.name}
              </span>
              ? It will be hidden from product forms.
            </>
          ) : (
            <>
              Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmGeneric?.name}
              </span>
              ?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmGeneric && toggleStatusMutation.mutate(confirmGeneric)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
