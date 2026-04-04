"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Building2, Plus, Pencil, Upload, SlidersHorizontal,
  Eye, Trash2, FileDown, FileText,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { StatusBadge }            from "@/components/ui/StatusBadge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { ImportModal }            from "@/components/common/ImportModal";
import { showToast }              from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS }  from "@/lib/constants";
import { BranchModal }            from "@/app/(pages)/branches/components/BranchModal";
import { BranchViewModal }        from "@/app/(pages)/branches/components/BranchViewModal";
import type { Branch, PaginatedResponse, ImportResult } from "@/types";

// ─── CSV / PDF export helpers ─────────────────────────────────────────────────

function buildBranchRow(branch: Branch): string[] {
  return [
    branch.name,
    branch.address,
    branch.phone,
    branch.license_number,
    branch.is_active ? "Active" : "Inactive",
  ];
}

function exportSelectedCsv(selectedBranches: Branch[]) {
  const header  = ["Branch", "Address", "Phone", "License No.", "Status"];
  const rows    = selectedBranches.map(buildBranchRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, "branches_selected.csv");
}

function exportSelectedPdf(selectedBranches: Branch[]) {
  const doc  = new jsPDF();
  const head = [["Branch", "Address", "Phone", "License No.", "Status"]];
  const body = selectedBranches.map(buildBranchRow);
  doc.setFontSize(14);
  doc.text("Branches — Selected Records", 14, 16);
  autoTable(doc, { head, body, startY: 22, styles: { fontSize: 8 } });
  doc.save("branches_selected.pdf");
}

// ─── Branches page ────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const { permissions } = useAuth();
  const canManage = permissions?.isAdmin || permissions?.isManager;

  const [statusFilter,  setStatusFilter]  = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [viewBranch,    setViewBranch]    = useState<Branch | null>(null);
  const [confirmBranch, setConfirmBranch] = useState<Branch | null>(null);
  const [importOpen,    setImportOpen]    = useState(false);

  // ─── Row selection ──────────────────────────────────────────────────────────
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const queryClient = useQueryClient();

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialPageSize: 20, initialSortField: "name" });

  const filters = { ...(statusFilter && { is_active: statusFilter }) };

  const hasActiveFilters  = statusFilter !== "";
  const activeFilterCount = statusFilter ? 1 : 0;

  function clearFilters() {
    setStatusFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const branches   = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ─── Toggle status mutation ──────────────────────────────────────────────────

  const toggleStatusMutation = useMutation({
    mutationFn: (branch: Branch) =>
      apiPatch<Branch>(`/branches/${branch.id}`, { is_active: !branch.is_active }),
    onSuccess: (_, branch) => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      showToast(
        "success",
        branch.is_active ? "Branch Deactivated" : "Branch Activated",
        branch.is_active
          ? `${branch.name} has been deactivated.`
          : `${branch.name} is now active.`
      );
      setConfirmBranch(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // ─── Selection helpers ───────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = branches.map((b) => b.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() {
    setAllPagesSelected(true);
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setAllPagesSelected(false);
  }

  const selectedBranches = branches.filter((b) => selectedKeys.has(b.id));

  // ─── Export ─────────────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter) exportParams.is_active = statusFilter;
        if (search)       exportParams.search    = search;
        const blob = await apiDownloadFile("/branches/export", exportParams);
        downloadBlob(blob, "branches_export.csv");
      } catch {
        showToast("error", "Export Failed", "Could not export branches. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedBranches);
    }
  }

  function handleExportPdf() {
    exportSelectedPdf(selectedBranches);
  }

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/branches/import", file);
    queryClient.invalidateQueries({ queryKey: ["branches"] });
    return result;
  }

  async function handleDownloadBranchTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/branches/import/template");
    downloadBlob(blob, "branches_import_template.csv");
  }

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<Branch>[] = [
    {
      key:      "name",
      header:   "Branch",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.name}
          </p>
          <p className="text-xs mt-0.5 truncate max-w-[260px]" style={{ color: "var(--color-text-muted)" }}>
            {row.address}
          </p>
        </div>
      ),
    },
    {
      key:    "phone",
      header: "Phone",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>{row.phone}</span>
      ),
    },
    {
      key:    "license_number",
      header: "License No.",
      render: (row) => (
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
        >
          {row.license_number}
        </span>
      ),
    },
    {
      key:    "is_active",
      header: "Status",
      render: (row) => (
        <StatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "100px",
      render: (row: Branch) => (
        <div className="flex items-center gap-0.5">
          {/* Basic actions */}
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewBranch(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <button
              title="Edit Branch"
              onClick={(e) => { e.stopPropagation(); setEditingBranch(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {canManage && (
            <button
              title={row.is_active ? "Deactivate Branch" : "Activate Branch"}
              onClick={(e) => { e.stopPropagation(); setConfirmBranch(row); }}
              className={
                row.is_active
                  ? "p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  : "p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;
  const isDeactivating = confirmBranch?.is_active === true;

  return (
    <div className="page-container">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Branches</h1>
          </div>
          <p className="page-subtitle mt-1">Manage all pharmacy branches across the organisation</p>
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
            placeholder="Search by name or address…"
            onSearch={handleSearch}
            className="w-[30rem] max-w-full"
          />
          {/* Separator + action buttons */}
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
                onClick={() => { setEditingBranch(null); setModalOpen(true); }}
              >
                New Branch
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

        {/* Select-all-pages banner */}
        {showSelectAllBanner && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>
              {pagination.pageSize} records on this page are selected.{" "}
            </span>
            <button
              onClick={handleSelectAllPages}
              className="font-semibold text-primary-500 hover:underline"
            >
              Select all {totalItems} records
            </button>
          </div>
        )}

        {allPagesSelected && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span className="font-semibold text-primary-500">All {totalItems} records selected.</span>
            {" "}
            <button onClick={clearSelection} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
              Clear selection
            </button>
          </div>
        )}

        <DataTable<Branch>
          columns={columns}
          data={branches}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No branches found matching "${search}"` : "No branches found."}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
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
              pageSizeOptions={[10, 20, 50]}
            />
          )}
        </div>

        {/* Export footer — visible only when rows are selected */}
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
      <BranchModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingBranch(null); }}
        editingBranch={editingBranch}
      />

      <BranchViewModal
        isOpen={!!viewBranch}
        onClose={() => setViewBranch(null)}
        branch={viewBranch}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Branches"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadBranchTemplate}
        templateNote="Required columns: name, address, phone, license_number. Optional: is_active (TRUE/FALSE, defaults to TRUE)."
      />

      <ConfirmModal
        isOpen={!!confirmBranch}
        onClose={() => setConfirmBranch(null)}
        title={isDeactivating ? "Deactivate Branch" : "Activate Branch"}
        body={
          isDeactivating ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmBranch?.name}
              </span>
              ? It will no longer appear as an active branch.
            </>
          ) : (
            <>
              Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmBranch?.name}
              </span>
              ?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmBranch && toggleStatusMutation.mutate(confirmBranch)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
