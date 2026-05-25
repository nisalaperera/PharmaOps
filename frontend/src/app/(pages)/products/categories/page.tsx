"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Pencil, Eye, Trash2, Upload, FileDown, FileText, ChevronRight, SlidersHorizontal } from "lucide-react";
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
import { CategoryModal }          from "./components/CategoryModal";
import { CategoryViewModal }      from "./components/CategoryViewModal";
import type { ProductCategory, ImportResult } from "@/types";

// ─── Tree helpers ─────────────────────────────────────────────────────────────

interface CategoryTreeRow extends ProductCategory {
  depth: number;
}

function buildTree(categories: ProductCategory[]): CategoryTreeRow[] {
  const rows: CategoryTreeRow[] = [];

  function traverse(parentId: string | null | undefined, depth: number) {
    const children = categories
      .filter((c) => (c.parent_id ?? null) === (parentId ?? null))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      rows.push({ ...child, depth });
      traverse(child.id, depth + 1);
    }
  }

  traverse(null, 0);
  return rows;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function exportCategoriesCsv(categories: ProductCategory[]) {
  const header  = ["name", "parent", "description"];
  const rows    = categories.map((c) => [c.name, c.parent_name ?? "", c.description ?? ""]);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `categories_${exportDateStamp()}.csv`);
}

async function exportCategoriesPdf(categories: ProductCategory[]) {
  const doc     = new jsPDF();
  const headers = [["Category Name", "Parent", "Description"]];
  const body    = categories.map((c) => [c.name, c.parent_name ?? "—", c.description ?? ""]);

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
  doc.text(`Categories Report — ${exportDateStamp()}`, 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head: headers, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`categories_${exportDateStamp()}.pdf`);
}

// ─── Categories page ──────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.isAdmin || permissions?.isManager;
  const queryClient     = useQueryClient();

  const [statusFilter,     setStatusFilter]     = useState("");
  const [filterVisible,    setFilterVisible]    = useState(false);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [editingCategory,  setEditingCategory]  = useState<ProductCategory | null>(null);
  const [viewCategory,     setViewCategory]     = useState<ProductCategory | null>(null);
  const [confirmCategory,  setConfirmCategory]  = useState<ProductCategory | null>(null);
  const [importOpen,       setImportOpen]       = useState(false);
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());

  const { pagination, search, goToPage, changePageSize, handleSearch } =
    usePagination({  });

  const { data: categories = [], isLoading } = useQuery<ProductCategory[]>({
    queryKey: ["categories"],
    queryFn:  () => apiGet<ProductCategory[]>("/products/categories"),
  });

  const hasActiveFilters  = statusFilter !== "";
  const activeFilterCount = statusFilter ? 1 : 0;

  function clearFilters() { setStatusFilter(""); goToPage(1); }
  function hideFilters()  { clearFilters(); setFilterVisible(false); }

  // When searching/filtering — flat list; otherwise — depth-first tree order
  const treeRows = useMemo<CategoryTreeRow[]>(() => {
    const q = search.trim().toLowerCase();
    const statusFiltered = categories.filter((c) =>
      statusFilter === ""      ? true :
      statusFilter === "true"  ? c.is_active :
                                 !c.is_active
    );
    if (q) {
      return statusFiltered
        .filter((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false) ||
          (c.parent_name?.toLowerCase().includes(q) ?? false)
        )
        .map((c) => ({ ...c, depth: 0 }));
    }
    return buildTree(statusFiltered);
  }, [categories, search, statusFilter]);

  const totalItems  = treeRows.length;
  const totalPages  = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  const pagedRows   = treeRows.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize);

  // ─── Selection ───────────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
  }, []);

  function clearSelection() { setSelectedKeys(new Set()); }

  const selectedItems  = treeRows.filter((c) => selectedKeys.has(c.id));
  const selectionCount = selectedKeys.size;

  // ─── Export ──────────────────────────────────────────────────────────────────

  function handleExportCsv()      { exportCategoriesCsv(selectionCount > 0 ? selectedItems : treeRows); }
  async function handleExportPdf() { await exportCategoriesPdf(selectedItems); }

  // ─── Toggle status mutation ──────────────────────────────────────────────────

  const toggleStatusMutation = useMutation({
    mutationFn: (category: ProductCategory) =>
      apiPatch<ProductCategory>(`/products/categories/${category.id}`, { is_active: !category.is_active }),
    onSuccess: (_, category) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      showToast(
        "success",
        category.is_active ? "Category Deactivated" : "Category Activated",
        category.is_active
          ? `${category.name} has been deactivated.`
          : `${category.name} is now active.`
      );
      setConfirmCategory(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  // ─── Import ──────────────────────────────────────────────────────────────────

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/products/categories/import", file);
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/products/categories/import/template");
    downloadBlob(blob, "categories_import_template.csv");
  }

  // ─── Columns ─────────────────────────────────────────────────────────────────

  const columns: Column<CategoryTreeRow>[] = [
    {
      key:    "name",
      header: "Category Name",
      render: (row) => (
        <div className="flex items-center gap-1.5" style={{ paddingLeft: `${row.depth * 20}px` }}>
          {row.depth > 0 && (
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
          )}
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.name}
          </p>
        </div>
      ),
    },
    {
      key:    "parent_name",
      header: "Parent",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.parent_name || "—"}
        </span>
      ),
    },
    {
      key:    "description",
      header: "Description",
      render: (row) => (
        <p className="text-sm truncate max-w-[360px]" style={{ color: "var(--color-text-muted)" }}>
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
            onClick={(e) => { e.stopPropagation(); setViewCategory(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <>
              <button
                title="Edit Category"
                onClick={(e) => { e.stopPropagation(); setEditingCategory(row); setModalOpen(true); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                title={row.is_active ? "Deactivate Category" : "Activate Category"}
                onClick={(e) => { e.stopPropagation(); setConfirmCategory(row); }}
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

  return (
    <div className="page-container">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Categories</h1>
          </div>
          <p className="page-subtitle mt-1">
            Manage product categories for the pharmacy catalog
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
            placeholder="Search categories…"
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
                onClick={() => { setEditingCategory(null); setModalOpen(true); }}
              >
                New Category
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
        <DataTable<CategoryTreeRow>
          columns={columns}
          data={pagedRows}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          emptyMessage={search ? `No categories found matching "${search}"` : "No categories found. Add one to get started."}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
          onRowClick={(row) => setViewCategory(row)}
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

        {(selectionCount > 0) && (
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
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileText className="w-3.5 h-3.5" />}
                onClick={handleExportPdf}
              >
                Export PDF
              </Button>
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

      <CategoryModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingCategory(null); }}
        editingCategory={editingCategory}
      />

      <CategoryViewModal
        isOpen={!!viewCategory}
        onClose={() => setViewCategory(null)}
        category={viewCategory}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Categories"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required: name. Optional: description."
      />

      <ConfirmModal
        isOpen={!!confirmCategory}
        onClose={() => setConfirmCategory(null)}
        title={confirmCategory?.is_active ? "Deactivate Category" : "Activate Category"}
        body={
          confirmCategory?.is_active ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmCategory?.name}
              </span>
              ? It will be hidden from product forms.
            </>
          ) : (
            <>
              Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmCategory?.name}
              </span>
              ?
            </>
          )
        }
        confirmLabel={confirmCategory?.is_active ? "Deactivate" : "Activate"}
        variant={confirmCategory?.is_active ? "danger" : "primary"}
        onConfirm={() => confirmCategory && toggleStatusMutation.mutate(confirmCategory)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
