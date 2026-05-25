"use client";

import { useState }                  from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Landmark, Plus, Pencil, Eye, Trash2, CheckCircle,
  ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal,
} from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { SearchBar }               from "@/components/common/SearchBar";
import { FilterBar }               from "@/components/common/FilterBar";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { ConfirmModal }            from "@/components/ui/ConfirmModal";
import { useAuth }                 from "@/hooks/useAuth";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet, apiPatch }        from "@/lib/api-client";
import { showToast }               from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS }   from "@/lib/constants";
import { getActiveStatusVariant }  from "@/lib/badges";
import { BankAccountModal }        from "@/app/(pages)/ledger/bank-accounts/components/BankAccountModal";
import { BankAccountViewModal }    from "@/app/(pages)/ledger/bank-accounts/components/BankAccountViewModal";
import { BankTransactionModal }    from "@/app/(pages)/ledger/bank-accounts/components/BankTransactionModal";
import type { BankAccount, PaginatedResponse } from "@/types";

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function BankAccountsPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;

  // â”€â”€ Filter state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [isActiveFilter, setIsActiveFilter] = useState("");
  const [filterVisible,  setFilterVisible]  = useState(false);

  // â”€â”€ Modal state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [modalOpen,         setModalOpen]         = useState(false);
  const [editingAccount,    setEditingAccount]     = useState<BankAccount | null>(null);
  const [viewAccount,       setViewAccount]        = useState<BankAccount | null>(null);
  const [transactionTarget, setTransactionTarget]  = useState<{
    account: BankAccount;
    type:    "DEPOSIT" | "WITHDRAWAL";
  } | null>(null);
  const [confirmToggle,     setConfirmToggle]      = useState<BankAccount | null>(null);

  // â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "account_name" });

  // â”€â”€ Filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const filters = {
    ...(isActiveFilter && { is_active: isActiveFilter }),
  };

  const hasActiveFilters  = isActiveFilter !== "";
  const activeFilterCount = isActiveFilter ? 1 : 0;

  function clearFilters() {
    setIsActiveFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // â”€â”€ Data fetching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<BankAccount>>({
    queryKey:        ["bank-accounts", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const accounts   = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // â”€â”€ Toggle status mutation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const toggleStatusMutation = useMutation({
    mutationFn: (account: BankAccount) =>
      apiPatch<BankAccount>(`/treasury/bank-accounts/${account.id}`, { is_active: !account.is_active }),
    onSuccess: (_, account) => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      showToast(
        "success",
        account.is_active ? "Account Deactivated" : "Account Activated",
        account.is_active
          ? `${account.account_name} has been deactivated.`
          : `${account.account_name} is now active.`
      );
      setConfirmToggle(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // â”€â”€ Column definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const columns: Column<BankAccount>[] = [
    {
      key:      "account_name",
      header:   "Account",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.account_name}
          </p>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--color-text-muted)" }}>
            {row.account_number}
          </p>
        </div>
      ),
    },
    {
      key:    "bank_name",
      header: "Bank",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>
          {row.bank_name}
        </span>
      ),
    },
    {
      key:    "branch_name",
      header: "Branch",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.branch_name}
        </span>
      ),
    },
    {
      key:    "current_balance",
      header: "Balance",
      render: (row) => (
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
          LKR {row.current_balance.toFixed(2)}
        </span>
      ),
    },
    {
      key:    "is_active",
      header: "Status",
      render: (row) => (
        <Badge variant={getActiveStatusVariant(row.is_active)} dot>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "180px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          {/* View */}
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewAccount(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {/* Deposit â€” always visible */}
          <button
            title="Deposit"
            onClick={(e) => { e.stopPropagation(); setTransactionTarget({ account: row, type: "DEPOSIT" }); }}
            className="p-1.5 rounded-md transition-colors text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>

          {/* Withdraw â€” always visible */}
          <button
            title="Withdraw"
            onClick={(e) => { e.stopPropagation(); setTransactionTarget({ account: row, type: "WITHDRAWAL" }); }}
            className="p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <>
              {/* Divider */}
              <span className="w-px h-4 mx-1 flex-shrink-0" style={{ background: "var(--color-border)" }} />

              {/* Edit */}
              <button
                title="Edit"
                onClick={(e) => { e.stopPropagation(); setEditingAccount(row); setModalOpen(true); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Toggle active */}
              {row.is_active ? (
                <button
                  title="Deactivate"
                  onClick={(e) => { e.stopPropagation(); setConfirmToggle(row); }}
                  className="p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  title="Activate"
                  onClick={(e) => { e.stopPropagation(); setConfirmToggle(row); }}
                  className="p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  // â”€â”€ Derived â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const isDeactivating = confirmToggle?.is_active === true;

  return (
    <div className="page-container">

      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Bank Account Management</h1>
          </div>
          <p className="page-subtitle mt-1">Manage branch bank accounts and balances</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter toggle */}
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
            placeholder="Search by account name, bankâ€¦"
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
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditingAccount(null); setModalOpen(true); }}
              >
                New Account
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ Filter bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={hideFilters}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Status
          </label>
          <select
            value={isActiveFilter}
            onChange={(e) => { setIsActiveFilter(e.target.value); goToPage(1); }}
            className="form-select w-auto"
          >
            {ACTIVE_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </FilterBar>

      {/* â”€â”€ Table card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        <DataTable<BankAccount>
          columns={columns}
          data={accounts}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No accounts found matching "${search}"` : "No bank accounts found."}
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

      {/* â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <BankAccountModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingAccount(null); }}
        editingAccount={editingAccount}
      />

      <BankAccountViewModal
        isOpen={!!viewAccount}
        onClose={() => setViewAccount(null)}
        account={viewAccount}
      />

      <BankTransactionModal
        isOpen={!!transactionTarget}
        onClose={() => setTransactionTarget(null)}
        account={transactionTarget?.account ?? null}
        transactionType={transactionTarget?.type ?? "DEPOSIT"}
      />

      <ConfirmModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        title={isDeactivating ? "Deactivate Account" : "Activate Account"}
        body={
          isDeactivating ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmToggle?.account_name}
              </span>
              ?
            </>
          ) : (
            <>
              Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmToggle?.account_name}
              </span>
              ?
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
