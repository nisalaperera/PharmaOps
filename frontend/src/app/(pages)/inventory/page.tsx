"use client";

import { useState, useCallback }                                from "react";
import { useQuery, keepPreviousData }                           from "@tanstack/react-query";
import { Archive, Eye, Pencil, PackagePlus, PackageMinus, SlidersHorizontal, FileDown, FileText, AlertTriangle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format }                                               from "date-fns";
import { DataTable, type Column }                               from "@/components/common/DataTable";
import { Pagination }                                           from "@/components/common/Pagination";
import { SearchBar }                                            from "@/components/common/SearchBar";
import { FilterBar }                                            from "@/components/common/FilterBar";
import { Button }                                               from "@/components/ui/Button";
import { Badge }                                                from "@/components/ui/Badge";
import { useAuth }                                              from "@/hooks/useAuth";
import { usePagination }                                        from "@/hooks/usePagination";
import { apiGet, apiDownloadFile, downloadBlob }                from "@/lib/api-client";
import { showToast }                                            from "@/lib/toast";
import { LOW_STOCK_FILTER_OPTIONS }                             from "@/lib/constants";
import APP_CONFIG                                               from "@/lib/config";
import { InventoryModal }    from "./components/InventoryModal";
import { InventoryViewModal } from "./components/InventoryViewModal";
import { StockInModal }       from "./components/StockInModal";
import { StockOutModal }      from "./components/StockOutModal";
import type { InventoryItem, Branch, PaginatedResponse }        from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Product Name", "Branch ID", "Total Qty",
  "Min Stock Level", "Low Stock", "Updated At",
];

function buildInventoryRow(item: InventoryItem): string[] {
  return [
    item.product_name,
    item.branch_id,
    String(item.total_quantity),
    String(item.min_stock_level),
    item.is_low_stock ? "Yes" : "No",
    item.updated_at ?? "",
  ];
}

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function exportSelectedCsv(selected: InventoryItem[]) {
  const rows    = selected.map(buildInventoryRow);
  const csvText = [CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(
    new Blob([csvText], { type: "text/csv;charset=utf-8;" }),
    `inventory_${exportDateStamp()}.csv`,
  );
}

async function exportSelectedPdf(selected: InventoryItem[], branchName?: string) {
  const doc  = new jsPDF();
  const head = [["Product Name", "Branch", "Total Qty", "Min Stock", "Low Stock"]];
  const body = selected.map((item) => [
    item.product_name,
    item.branch_id,
    String(item.total_quantity),
    String(item.min_stock_level),
    item.is_low_stock ? "Yes" : "No",
  ]);

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

  if (branchName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Branch: ${branchName}`, 28, cursorY);
    cursorY += 6;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Inventory Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });

  const branchSlug = branchName ? `_${branchName.toLowerCase().replace(/\s+/g, "_")}` : "";
  doc.save(`inventory${branchSlug}_${exportDateStamp()}.pdf`);
}

// ─── Inventory page ───────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;

  // — Filters
  const [lowStockFilter, setLowStockFilter] = useState("");
  const [branchFilter,   setBranchFilter]   = useState("");
  const [filterVisible,  setFilterVisible]  = useState(false);

  // — Modals
  const [editingItem,  setEditingItem]  = useState<InventoryItem | null>(null);
  const [viewItem,     setViewItem]     = useState<InventoryItem | null>(null);
  const [stockInOpen,  setStockInOpen]  = useState(false);
  const [stockInItem,  setStockInItem]  = useState<InventoryItem | null>(null);
  const [stockOutItem, setStockOutItem] = useState<InventoryItem | null>(null);

  function openStockIn(item: InventoryItem | null) {
    setStockInItem(item);
    setStockInOpen(true);
  }

  function closeStockIn() {
    setStockInOpen(false);
  }

  // — Selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "product_name" });

  const filters = {
    ...(branchFilter   && { branch_id: branchFilter }),
    ...(lowStockFilter !== "" && { low_stock: lowStockFilter === "true" }),
  };

  const hasActiveFilters  = lowStockFilter !== "" || branchFilter !== "";
  const activeFilterCount = (lowStockFilter ? 1 : 0) + (branchFilter ? 1 : 0);

  function clearFilters() {
    setLowStockFilter("");
    setBranchFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // ─── Data ────────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<PaginatedResponse<InventoryItem>>({
    queryKey:        ["inventory", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<InventoryItem>>("/inventory", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    enabled:   permissions?.isOrgLevel ?? false,
    staleTime: 5 * 60 * 1000,
  });
  const allBranches   = branchesData?.data ?? [];
  const branchNameMap = Object.fromEntries(allBranches.map((b) => [b.id, b.name]));

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const currentBranchName = branchFilter ? (branchNameMap[branchFilter] ?? undefined) : undefined;

  // ─── Selection ───────────────────────────────────────────────────────────────

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

  // ─── Export ──────────────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (branchFilter)   exportParams.branch_id = branchFilter;
        if (lowStockFilter) exportParams.low_stock  = lowStockFilter === "true";
        if (search)         exportParams.search     = search;
        const blob = await apiDownloadFile("/inventory/export", exportParams);
        downloadBlob(blob, `inventory_${exportDateStamp()}.csv`);
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
    await exportSelectedPdf(selectedItems, currentBranchName);
  }

  // ─── Columns ─────────────────────────────────────────────────────────────────

  const columns: Column<InventoryItem>[] = [
    {
      key:      "product_name",
      header:   "Product",
      sortable: true,
      render:   (row) => (
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          {row.product_name}
        </p>
      ),
    },
    ...(permissions?.isOrgLevel
      ? [{
          key:    "branch_id",
          header: "Branch",
          render: (row: InventoryItem) => (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {branchNameMap[row.branch_id] ?? row.branch_id}
            </p>
          ),
        }]
      : []) as Column<InventoryItem>[],
    {
      key:      "total_quantity",
      header:   "Total Qty",
      sortable: true,
      render:   (row) => (
        <p className="text-sm font-medium tabular-nums" style={{ color: "var(--color-text)" }}>
          {row.total_quantity.toLocaleString()}
        </p>
      ),
    },
    {
      key:      "min_stock_level",
      header:   "Min Stock",
      sortable: true,
      render:   (row) => (
        <p className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {row.min_stock_level.toLocaleString()}
        </p>
      ),
    },
    {
      key:    "is_low_stock",
      header: "Status",
      render: (row) =>
        row.is_low_stock ? (
          <Badge variant="danger">
            <AlertTriangle className="w-3 h-3" />
            Low Stock
          </Badge>
        ) : (
          <Badge variant="success">In Stock</Badge>
        ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "140px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewItem(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <>
              <button
                title="Stock In"
                onClick={(e) => { e.stopPropagation(); openStockIn(row); }}
                className="p-1.5 rounded-md transition-colors text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              >
                <PackagePlus className="w-3.5 h-3.5" />
              </button>
              <button
                title="Stock Out"
                onClick={(e) => { e.stopPropagation(); setStockOutItem(row); }}
                className="p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
              >
                <PackageMinus className="w-3.5 h-3.5" />
              </button>
              <button
                title="Edit Min Stock Level"
                onClick={(e) => { e.stopPropagation(); setEditingItem(row); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Inventory</h1>
          </div>
          <p className="page-subtitle mt-1">
            Monitor stock levels and batch details across all products
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PackagePlus className="w-3.5 h-3.5" />}
              onClick={() => openStockIn(null)}
            >
              Stock In
            </Button>
          )}

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
            placeholder="Search by product name…"
            onSearch={handleSearch}
            className="w-[24rem] max-w-full"
          />
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={hideFilters}
      >
        {permissions?.isOrgLevel && (
          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); goToPage(1); }}
            className="form-select w-auto"
          >
            <option value="">All Branches</option>
            {allBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        <select
          value={lowStockFilter}
          onChange={(e) => { setLowStockFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {LOW_STOCK_FILTER_OPTIONS.map((opt) => (
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

        <DataTable<InventoryItem>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={
            search || hasActiveFilters
              ? "No inventory items match the current filters."
              : "No inventory records found."
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

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <InventoryModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        editingItem={editingItem}
      />

      <InventoryViewModal
        isOpen={!!viewItem}
        onClose={() => setViewItem(null)}
        item={viewItem}
        branchNameMap={branchNameMap}
      />

      <StockInModal
        isOpen={stockInOpen}
        onClose={closeStockIn}
        inventoryItem={stockInItem}
      />

      <StockOutModal
        isOpen={!!stockOutItem}
        onClose={() => setStockOutItem(null)}
        inventoryItem={stockOutItem}
      />
    </div>
  );
}
