"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Vault, Plus, Pencil, SlidersHorizontal,
  Eye, Trash2, CheckCircle, LockOpen, Lock,
  ArrowDownToLine, ArrowUpFromLine,
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
import { apiGet, apiPatch }       from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS }  from "@/lib/constants";
import {
  getActiveStatusVariant,
  getRegistryStatusVariant,
} from "@/lib/badges";
import { CashRegistryModal }         from "@/app/(pages)/billing/registries/components/CashRegistryModal";
import { CashRegistryViewModal }     from "@/app/(pages)/billing/registries/components/CashRegistryViewModal";
import { OpenRegistryModal }         from "@/app/(pages)/billing/registries/components/OpenRegistryModal";
import { CloseRegistryModal }        from "@/app/(pages)/billing/registries/components/CloseRegistryModal";
import { RegistryTransactionModal }  from "@/app/(pages)/billing/registries/components/RegistryTransactionModal";
import type { CashRegistry, PaginatedResponse } from "@/types";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CashRegistriesPage() {
  const { permissions }  = useAuth();
  const canManage        = permissions?.can("BRANCH_MANAGER") ?? false;

  // ─── Filter state ────────────────────────────────────────────────────────────

  const [filterStatus,  setFilterStatus]  = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  // ─── Modal state ─────────────────────────────────────────────────────────────

  const [modalOpen,          setModalOpen]          = useState(false);
  const [editingRegistry,    setEditingRegistry]    = useState<CashRegistry | null>(null);
  const [viewRegistry,       setViewRegistry]       = useState<CashRegistry | null>(null);
  const [openTarget,         setOpenTarget]         = useState<CashRegistry | null>(null);
  const [closeTarget,        setCloseTarget]        = useState<CashRegistry | null>(null);
  const [transactionTarget,  setTransactionTarget]  = useState<{
    registry: CashRegistry;
    type: "DEPOSIT" | "WITHDRAWAL";
  } | null>(null);
  const [confirmToggle,      setConfirmToggle]      = useState<CashRegistry | null>(null);

  // ─── Pagination ───────────────────────────────────────────────────────────────

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "name" });

  // ─── Filters ─────────────────────────────────────────────────────────────────

  const filters = {
    ...(filterStatus !== "" && { is_active: filterStatus === "true" }),
  };

  const hasActiveFilters  = filterStatus !== "";
  const activeFilterCount = filterStatus ? 1 : 0;

  function clearFilters() {
    setFilterStatus("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // ─── Data fetching ────────────────────────────────────────────────────────────

  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<CashRegistry>>({
    queryKey:        ["registries", queryParams, filters],
    queryFn:         () =>
      apiGet<PaginatedResponse<CashRegistry>>("/treasury/registries", {
        ...queryParams,
        ...filters,
      }),
    placeholderData: keepPreviousData,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ─── Toggle status mutation ───────────────────────────────────────────────────

  const toggleStatusMutation = useMutation({
    mutationFn: (registry: CashRegistry) =>
      apiPatch<CashRegistry>(`/treasury/registries/${registry.id}`, {
        is_active: !registry.is_active,
      }),
    onSuccess: (_, registry) => {
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      showToast(
        "success",
        registry.is_active ? "Registry Deactivated" : "Registry Activated",
        registry.is_active
          ? `${registry.name} has been deactivated.`
          : `${registry.name} is now active.`
      );
      setConfirmToggle(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // ─── Columns ─────────────────────────────────────────────────────────────────

  const columns: Column<CashRegistry>[] = [
    {
      key:      "name",
      header:   "Registry",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {row.branch_name}
          </p>
        </div>
      ),
    },
    {
      key:    "is_open",
      header: "Status",
      render: (row) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant={getRegistryStatusVariant(row.is_open)} dot>
            {row.is_open ? "Open" : "Closed"}
          </Badge>
          <Badge variant={getActiveStatusVariant(row.is_active)} dot>
            {row.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      ),
    },
    {
      key:    "current_balance",
      header: "Balance",
      render: (row) => (
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: row.current_balance > 0 ? "var(--color-text)" : "var(--color-text-muted)" }}
        >
          LKR {row.current_balance.toFixed(2)}
        </span>
      ),
    },
    {
      key:    "responsible_staff_name",
      header: "Responsible Staff",
      render: (row) => (
        <span className="text-sm" style={{ color: row.responsible_staff_name ? "var(--color-text)" : "var(--color-text-muted)" }}>
          {row.responsible_staff_name ?? "—"}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "160px",
      render: (row) => (
        <div className="flex items-center gap-0.5">

          {/* View */}
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewRegistry(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {/* Deposit — only when open & active */}
          {row.is_open && row.is_active && (
            <button
              title="Deposit"
              onClick={(e) => { e.stopPropagation(); setTransactionTarget({ registry: row, type: "DEPOSIT" }); }}
              className="p-1.5 rounded-md transition-colors text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Withdraw — only when open & active */}
          {row.is_open && row.is_active && (
            <button
              title="Withdraw"
              onClick={(e) => { e.stopPropagation(); setTransactionTarget({ registry: row, type: "WITHDRAWAL" }); }}
              className="p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Separator before management actions */}
          {canManage && (
            <span className="w-px h-4 mx-1 flex-shrink-0" style={{ background: "var(--color-border)" }} />
          )}

          {/* Open registry — canManage + not open + active */}
          {canManage && !row.is_open && row.is_active && (
            <button
              title="Open Registry"
              onClick={(e) => { e.stopPropagation(); setOpenTarget(row); }}
              className="p-1.5 rounded-md transition-colors text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <LockOpen className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Close registry — canManage + is open */}
          {canManage && row.is_open && (
            <button
              title="Close Registry"
              onClick={(e) => { e.stopPropagation(); setCloseTarget(row); }}
              className="p-1.5 rounded-md transition-colors text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Edit */}
          {canManage && (
            <button
              title="Edit"
              onClick={(e) => { e.stopPropagation(); setEditingRegistry(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Deactivate / Activate toggle */}
          {canManage && (
            <button
              title={row.is_active ? "Deactivate" : "Activate"}
              onClick={(e) => { e.stopPropagation(); setConfirmToggle(row); }}
              className={
                row.is_active
                  ? "p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  : "p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }
            >
              {row.is_active
                ? <Trash2 className="w-3.5 h-3.5" />
                : <CheckCircle className="w-3.5 h-3.5" />
              }
            </button>
          )}

        </div>
      ),
    },
  ];

  const isDeactivating = confirmToggle?.is_active === true;

  // ─── Unused callback kept for useCallback pattern consistency ─────────────────
  // (no row selection on this page, but we use useCallback in helpers above)
  const handleSelectionChange = useCallback((_keys: Set<string>) => {}, []);
  void handleSelectionChange;

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Vault className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Cash Registry Management</h1>
          </div>
          <p className="page-subtitle mt-1">Manage branch cash registers and daily balances</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters toggle */}
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
            placeholder="Search by name or branch…"
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
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditingRegistry(null); setModalOpen(true); }}
              >
                New Registry
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={hideFilters}
      >
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {ACTIVE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      {/* ── Table card ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>

        <DataTable<CashRegistry>
          columns={columns}
          data={items}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No registries found matching "${search}"` : "No cash registries found."}
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

      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <CashRegistryModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingRegistry(null); }}
        editingRegistry={editingRegistry}
      />

      <CashRegistryViewModal
        isOpen={!!viewRegistry}
        onClose={() => setViewRegistry(null)}
        registry={viewRegistry}
      />

      <OpenRegistryModal
        isOpen={!!openTarget}
        onClose={() => setOpenTarget(null)}
        registry={openTarget}
      />

      <CloseRegistryModal
        isOpen={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        registry={closeTarget}
      />

      <RegistryTransactionModal
        isOpen={!!transactionTarget}
        onClose={() => setTransactionTarget(null)}
        registry={transactionTarget?.registry ?? null}
        transactionType={transactionTarget?.type ?? "DEPOSIT"}
      />

      <ConfirmModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        title={isDeactivating ? "Deactivate Registry" : "Activate Registry"}
        body={
          isDeactivating ? (
            <>Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmToggle?.name}
              </span>?
            </>
          ) : (
            <>Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmToggle?.name}
              </span>?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmToggle && toggleStatusMutation.mutate(confirmToggle)}
        isLoading={toggleStatusMutation.isPending}
      />

    </div>
  );
}
