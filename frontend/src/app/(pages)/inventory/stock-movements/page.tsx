"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  PackagePlus, PackageMinus, Eye, Pencil, Trash2, SlidersHorizontal, ClipboardCheck,
} from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiDelete }      from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import {
  STOCK_MOVEMENT_TYPE_OPTIONS,
  STOCK_MOVEMENT_STATUS_OPTIONS,
  STOCK_MOVEMENT_TYPE_LABEL,
  STOCK_MOVEMENT_STATUS_LABEL,
} from "@/lib/constants";
import {
  STOCK_MOVEMENT_TYPE_VARIANT,
  STOCK_MOVEMENT_STATUS_VARIANT,
} from "@/lib/badges";
import { formatDateTime }         from "@/lib/utils";
import { StockMovementModal }     from "./components/StockMovementModal";
import { StockMovementViewModal } from "./components/StockMovementViewModal";
import type {
  StockMovement,
  PaginatedResponse,
} from "@/types";

export default function StockMovementsPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;

  const [typeFilter,    setTypeFilter]    = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<"STOCK_IN" | "STOCK_OUT">("STOCK_IN");
  const [editingMovement,  setEditingMovement]  = useState<StockMovement | null>(null);
  const [viewMovement,     setViewMovement]     = useState<StockMovement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StockMovement | null>(null);

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  const queryClient = useQueryClient();

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({
      initialSortField:     "created_at",
      initialSortDirection: "desc",
    });

  const filters = {
    ...(typeFilter   && { type:   typeFilter }),
    ...(statusFilter && { status: statusFilter }),
  };

  const hasActiveFilters  = typeFilter !== "" || statusFilter !== "";
  const activeFilterCount = [typeFilter, statusFilter].filter(Boolean).length;

  function clearFilters() {
    setTypeFilter("");
    setStatusFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<StockMovement>>({
    queryKey:        ["stock-movements", queryParams, filters],
    queryFn:         () =>
      apiGet<PaginatedResponse<StockMovement>>("/stock-movements", {
        ...queryParams,
        ...filters,
      }),
    placeholderData: keepPreviousData,
  });

  const stockMovements = data?.data        ?? [];
  const totalItems     = data?.total       ?? 0;
  const totalPages     = data?.total_pages ?? 1;

  // ─── Delete mutation ────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/stock-movements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      showToast("success", "Stock Movement Deleted", "The stock movement has been removed.");
      setConfirmDelete(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Delete Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // ─── Selection helpers ──────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = stockMovements.map((o) => o.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  // ─── Edit handler ───────────────────────────────────────────────────────────

  function openEdit(movement: StockMovement) {
    setEditingMovement(movement);
    setModalOpen(true);
  }

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<StockMovement>[] = [
    {
      key:      "movement_number",
      header:   "Movement #",
      sortable: true,
      render:   (row) => (
        <span className="text-sm font-mono font-semibold" style={{ color: "var(--color-text)" }}>
          {row.movement_number}
        </span>
      ),
    },
    {
      key:    "type",
      header: "Type",
      render: (row) => (
        <Badge variant={STOCK_MOVEMENT_TYPE_VARIANT[row.type]}>
          {STOCK_MOVEMENT_TYPE_LABEL[row.type]}
        </Badge>
      ),
    },
    {
      key:    "items",
      header: "Items",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.items.length} item{row.items.length !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (row) => (
        <Badge variant={STOCK_MOVEMENT_STATUS_VARIANT[row.status]}>
          {STOCK_MOVEMENT_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key:      "created_at",
      header:   "Date",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.created_at ? formatDateTime(row.created_at) : "—"}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "120px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewMovement(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {row.status !== "COMPLETED" && canManage && (
            <button
              title="Confirm Items"
              onClick={(e) => { e.stopPropagation(); setViewMovement(row); }}
              className="p-1.5 rounded-md transition-colors text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
            </button>
          )}

          {row.status === "CREATED" && canManage && (
            <button
              title="Edit Stock Movement"
              onClick={(e) => { e.stopPropagation(); openEdit(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {row.status === "CREATED" && canManage && (
            <button
              title="Delete Stock Movement"
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(row); }}
              className="p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
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
            <PackagePlus className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Stock Movements</h1>
          </div>
          <p className="page-subtitle mt-1">
            Manage stock in and stock out orders
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
            placeholder="Search by movement number..."
            onSearch={handleSearch}
            className="w-[30rem] max-w-full"
          />

          {canManage && (
            <div
              className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Button
                variant="primary"
                size="sm"
                leftIcon={<PackagePlus className="w-3.5 h-3.5" />}
                onClick={() => { setEditingMovement(null); setModalDefaultType("STOCK_IN"); setModalOpen(true); }}
              >
                Stock In
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<PackageMinus className="w-3.5 h-3.5" />}
                onClick={() => { setEditingMovement(null); setModalDefaultType("STOCK_OUT"); setModalOpen(true); }}
              >
                Stock Out
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
          {STOCK_MOVEMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {STOCK_MOVEMENT_STATUS_OPTIONS.map((opt) => (
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

        <DataTable<StockMovement>
          columns={columns}
          data={stockMovements}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          onRowClick={(row) => setViewMovement(row)}
          emptyMessage={
            search
              ? `No stock movements found matching "${search}".`
              : hasActiveFilters
                ? "No stock movements found matching the current filters."
                : "No stock movements yet. Create one to get started."
          }
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
      </div>

      {/* Modals */}
      <StockMovementModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingMovement(null); }}
        editingMovement={editingMovement}
        defaultType={modalDefaultType}
      />

      <StockMovementViewModal
        isOpen={!!viewMovement}
        onClose={() => setViewMovement(null)}
        movement={viewMovement}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        title="Delete Stock Movement"
        body={`Are you sure you want to delete movement ${confirmDelete?.movement_number}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
