"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Package, Plus, Pencil, Eye, Trash2, Copy, SlidersHorizontal,
  FileDown, FileText, Upload,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable, type Column }   from "@/components/common/DataTable";
import { Pagination }               from "@/components/common/Pagination";
import { SearchBar }                from "@/components/common/SearchBar";
import { FilterBar }                from "@/components/common/FilterBar";
import { Button }                   from "@/components/ui/Button";
import { StatusBadge }              from "@/components/ui/StatusBadge";
import { ConfirmModal }             from "@/components/ui/ConfirmModal";
import { ProductImportWizard }      from "./components/ProductImportWizard";
import { Autocomplete }             from "@/components/ui/Autocomplete";
import { useAuth }                  from "@/hooks/useAuth";
import { usePagination }            from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { showToast }                from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS }    from "@/lib/constants";
import APP_CONFIG                   from "@/lib/config";
import { ProductModal }             from "./components/ProductModal";
import { ProductViewModal }         from "./components/ProductViewModal";
import type { Product, ProductCategory, ProductBrand, ProductGeneric, ProductSku, PaginatedResponse, ImportResult } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "name", "generic_name", "brand_name", "category_name", "basic_sku_name",
  "barcode", "specific_instructions", "is_active",
];

function buildProductRow(product: Product): string[] {
  return [
    product.name,
    product.generic_name,
    product.brand_name,
    product.category_name,
    product.basic_sku_name,
    product.barcode ?? "",
    product.specific_instructions ?? "",
    product.is_active ? "TRUE" : "FALSE",
  ];
}

function exportSelectedCsv(selectedProducts: Product[]) {
  const maxMappings = Math.max(2, ...selectedProducts.map((p) => p.sku_mappings?.length ?? 0));

  const mappingHeaders: string[] = [];
  for (let n = 1; n <= maxMappings; n++) {
    mappingHeaders.push(`sku_map_${n}_sku`, `sku_map_${n}_mapped_to`, `sku_map_${n}_qty`);
  }

  const rows = selectedProducts.map((p) => {
    const baseRow      = buildProductRow(p);
    const mappingCells: string[] = [];
    for (let n = 0; n < maxMappings; n++) {
      const m = p.sku_mappings?.[n];
      mappingCells.push(m?.sku ?? "", m?.mapped_sku ?? "", m ? String(m.mapped_sku_count) : "");
    }
    return [...baseRow, ...mappingCells];
  });

  const csvText = [[...CSV_HEADERS, ...mappingHeaders], ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const today = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `products_${today}.csv`);
}

function exportSelectedPdf(selectedProducts: Product[]) {
  const doc    = new jsPDF();
  const pdfHeaders = ["Name", "Generic", "Brand", "Category", "Basic SKU", "Barcode", "Instructions", "Status"];
  const body   = selectedProducts.map(buildProductRow);
  let   yPos   = 16;

  try {
    const img = new Image();
    img.src   = APP_CONFIG.orgLogo;
    doc.addImage(img, "PNG", 14, 10, 10, 10);
    yPos = 14;
  } catch { /* skip logo if load fails */ }

  doc.setFontSize(13);
  doc.text(`${APP_CONFIG.orgName} — Product Catalog`, 28, yPos + 4);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Exported: ${new Date().toISOString().slice(0, 10)}`, 28, yPos + 10);
  doc.setTextColor(0);

  autoTable(doc, { head: [pdfHeaders], body, startY: yPos + 16, styles: { fontSize: 7 } });

  const today = new Date().toISOString().slice(0, 10);
  doc.save(`products_${today}.pdf`);
}

// ─── Products page ────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.isAdmin || permissions?.isManager;

  const [statusFilter,   setStatusFilter]   = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter,    setBrandFilter]    = useState("");
  const [genericFilter,  setGenericFilter]  = useState("");
  const [skuFilter,      setSkuFilter]      = useState("");
  const [filterVisible,  setFilterVisible]  = useState(false);
  const [modalOpen,       setModalOpen]       = useState(false);
  const [editingProduct,  setEditingProduct]  = useState<Product | null>(null);
  const [cloningProduct,  setCloningProduct]  = useState<Product | null>(null);
  const [viewProduct,     setViewProduct]     = useState<Product | null>(null);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [importOpen,     setImportOpen]     = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  const queryClient = useQueryClient();

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "name" });

  const filters = {
    ...(statusFilter   && { is_active:    statusFilter }),
    ...(categoryFilter && { category_id:  categoryFilter }),
    ...(brandFilter    && { brand_id:     brandFilter }),
    ...(genericFilter  && { generic_id:   genericFilter }),
    ...(skuFilter      && { basic_sku_id: skuFilter }),
  };

  const activeFilterCount =
    (statusFilter   ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (brandFilter    ? 1 : 0) +
    (genericFilter  ? 1 : 0) +
    (skuFilter      ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  function clearFilters() {
    setStatusFilter(""); setCategoryFilter(""); setBrandFilter("");
    setGenericFilter(""); setSkuFilter("");
    goToPage(1);
  }

  function hideFilters() { clearFilters(); setFilterVisible(false); }

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Product>>({
    queryKey: ["products", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<Product>>("/products", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ["categories"],
    queryFn:  () => apiGet<ProductCategory[]>("/products/categories"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: brands = [] } = useQuery<ProductBrand[]>({
    queryKey: ["brands"],
    queryFn:  () => apiGet<ProductBrand[]>("/products/brands"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: generics = [] } = useQuery<ProductGeneric[]>({
    queryKey: ["generics"],
    queryFn:  () => apiGet<ProductGeneric[]>("/products/generics"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: skus = [] } = useQuery<ProductSku[]>({
    queryKey: ["skus"],
    queryFn:  () => apiGet<ProductSku[]>("/products/skus"),
    staleTime: 5 * 60 * 1000,
  });

  const products   = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ─── Toggle status mutation ──────────────────────────────────────────────────

  const toggleStatusMutation = useMutation({
    mutationFn: (product: Product) =>
      apiPatch<Product>(`/products/${product.id}`, { is_active: !product.is_active }),
    onSuccess: (_, product) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      showToast(
        "success",
        product.is_active ? "Product Deactivated" : "Product Activated",
        product.is_active
          ? `${product.name} has been deactivated.`
          : `${product.name} is now active.`
      );
      setConfirmProduct(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  // ─── Selection helpers ───────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = products.map((p) => p.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedProducts = products.filter((p) => selectedKeys.has(p.id));
  const selectionCount   = allPagesSelected ? totalItems : selectedKeys.size;

  // ─── Export ─────────────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter)   exportParams.is_active    = statusFilter;
        if (categoryFilter) exportParams.category_id  = categoryFilter;
        if (brandFilter)    exportParams.brand_id     = brandFilter;
        if (genericFilter)  exportParams.generic_id   = genericFilter;
        if (skuFilter)      exportParams.basic_sku_id = skuFilter;
        if (search)         exportParams.search       = search;
        const blob = await apiDownloadFile("/products/export", exportParams);
        const today = new Date().toISOString().slice(0, 10);
        downloadBlob(blob, `products_${today}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export products. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedProducts);
    }
  }

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/products/import", file);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/products/import/template");
    downloadBlob(blob, "products_import_template.csv");
  }

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<Product>[] = [
    {
      key:      "name",
      header:   "Product",
      sortable: true,
      render:   (row) => (
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          {row.name}
        </p>
      ),
    },
    {
      key:      "generic_name",
      header:   "Generic",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>
          {row.generic_name || "—"}
        </span>
      ),
    },
    {
      key:      "brand_name",
      header:   "Brand",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>
          {row.brand_name || "—"}
        </span>
      ),
    },
    {
      key:      "category_name",
      header:   "Category",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>
          {row.category_name || "—"}
        </span>
      ),
    },
    {
      key:    "basic_sku_name",
      header: "Basic SKU",
      render: (row) => (
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
        >
          {row.basic_sku_name || "—"}
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
      width:  "130px",
      render: (row: Product) => (
        <div className="flex items-center gap-0.5">
          {canManage && (
            <>
              <button
                title="Clone Product"
                onClick={(e) => { e.stopPropagation(); setCloningProduct(row); setEditingProduct(null); setModalOpen(true); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 mx-1" style={{ background: "var(--color-border)" }} />
            </>
          )}

          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewProduct(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <button
              title="Edit Product"
              onClick={(e) => { e.stopPropagation(); setEditingProduct(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {canManage && (
            <button
              title={row.is_active ? "Deactivate" : "Activate"}
              onClick={(e) => { e.stopPropagation(); setConfirmProduct(row); }}
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

  const isDeactivating = confirmProduct?.is_active === true;

  return (
    <div className="page-container">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Products</h1>
          </div>
          <p className="page-subtitle mt-1">Manage the pharmaceutical product catalog</p>
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
            placeholder="Search by name, barcode, generic, brand or category…"
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
                onClick={() => { setEditingProduct(null); setModalOpen(true); }}
              >
                New Product
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
        <Autocomplete
          className="min-w-[180px]"
          placeholder="All Categories"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          value={categoryFilter}
          onChange={(v) => { setCategoryFilter(v); goToPage(1); }}
        />

        <Autocomplete
          className="min-w-[180px]"
          placeholder="All Brands"
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          value={brandFilter}
          onChange={(v) => { setBrandFilter(v); goToPage(1); }}
        />

        <Autocomplete
          className="min-w-[180px]"
          placeholder="All Generics"
          options={generics.map((g) => ({ value: g.id, label: g.name }))}
          value={genericFilter}
          onChange={(v) => { setGenericFilter(v); goToPage(1); }}
        />

        <Autocomplete
          className="min-w-[160px]"
          placeholder="All SKUs"
          options={skus.map((s) => ({ value: s.id, label: s.name }))}
          value={skuFilter}
          onChange={(v) => { setSkuFilter(v); goToPage(1); }}
        />

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
            <span className="font-semibold text-primary-500">All {totalItems} records selected.</span>
            {" "}
            <button onClick={clearSelection} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
              Clear selection
            </button>
          </div>
        )}

        <DataTable<Product>
          columns={columns}
          data={products}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No products found matching "${search}"` : "No products found."}
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
                isLoading={isExportingCsv}
              >
                Export CSV
              </Button>
              {!allPagesSelected && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<FileText className="w-3.5 h-3.5" />}
                  onClick={() => exportSelectedPdf(selectedProducts)}
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
      <ProductModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingProduct(null); setCloningProduct(null); }}
        editingProduct={editingProduct}
        cloningProduct={cloningProduct}
      />

      <ProductViewModal
        isOpen={!!viewProduct}
        onClose={() => setViewProduct(null)}
        product={viewProduct}
      />

      <ProductImportWizard
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required: name, generic_name, brand_name, category_name, basic_sku_name. Optional: barcode, specific_instructions, is_active (TRUE/FALSE). SKU mappings: sku_map_N_sku, sku_map_N_mapped_to, sku_map_N_qty (N = 1, 2, …)."
      />

      <ConfirmModal
        isOpen={!!confirmProduct}
        onClose={() => setConfirmProduct(null)}
        title={isDeactivating ? "Deactivate Product" : "Activate Product"}
        body={
          isDeactivating ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmProduct?.name}
              </span>
              ? It will no longer be visible in active listings.
            </>
          ) : (
            <>
              Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmProduct?.name}
              </span>
              ?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmProduct && toggleStatusMutation.mutate(confirmProduct)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
