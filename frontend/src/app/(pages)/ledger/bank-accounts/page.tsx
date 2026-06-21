"use client";

import { useState, useCallback }   from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Landmark, Plus, Pencil, Eye, Trash2, CheckCircle,
  ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal,
  FileDown, FileText,
} from "lucide-react";
import { format }                   from "date-fns";
import jsPDF                        from "jspdf";
import autoTable                    from "jspdf-autotable";
import APP_CONFIG                   from "@/lib/config";
import { DataTable, type Column }   from "@/components/common/DataTable";
import { Pagination }               from "@/components/common/Pagination";
import { SearchBar }                from "@/components/common/SearchBar";
import { FilterBar }                from "@/components/common/FilterBar";
import { Button }                   from "@/components/ui/Button";
import { Badge }                    from "@/components/ui/Badge";
import { ConfirmModal }             from "@/components/ui/ConfirmModal";
import { useAuth }                  from "@/hooks/useAuth";
import { usePagination }            from "@/hooks/usePagination";
import { apiGet, apiPatch, downloadBlob } from "@/lib/api-client";
import { formatAmount }             from "@/lib/utils";
import { showToast }                from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS }    from "@/lib/constants";
import { getActiveStatusVariant }   from "@/lib/badges";
import { BankAccountModal }         from "@/app/(pages)/ledger/bank-accounts/components/BankAccountModal";
import { BankAccountViewModal }     from "@/app/(pages)/ledger/bank-accounts/components/BankAccountViewModal";
import { BankTransactionModal }     from "@/app/(pages)/ledger/bank-accounts/components/BankTransactionModal";
import type { BankAccount, PaginatedResponse } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(account: BankAccount): string[] {
  return [
    account.account_name,
    account.account_number,
    account.bank_name,
    account.branch_name,
    `LKR ${formatAmount(account.current_balance)}`,
    account.is_active ? "Active" : "Inactive",
  ];
}

function exportSelectedCsv(selected: BankAccount[]) {
  const header  = ["Account Name", "Account Number", "Bank", "Branch", "Balance", "Status"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `bank_accounts_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: BankAccount[]) {
  const doc  = new jsPDF();
  const head = [["Account Name", "Account Number", "Bank", "Branch", "Balance", "Status"]];
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
    // Logo load failure is non-fatal
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
  cursorY += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Bank Accounts Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });

  doc.save(`bank_accounts_${exportDateStamp()}.pdf`);
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function BankAccountsPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;

  // ── Filter state ────────────────────────────────────────────────────────────

  const [isActiveFilter, setIsActiveFilter] = useState("");
  const [filterVisible,  setFilterVisible]  = useState(false);

  // ── Modal state ─────────────────────────────────────────────────────────────

  const [modalOpen,         setModalOpen]         = useState(false);
  const [editingAccount,    setEditingAccount]     = useState<BankAccount | null>(null);
  const [viewAccount,       setViewAccount]        = useState<BankAccount | null>(null);
  const [transactionTarget, setTransactionTarget]  = useState<{
    account: BankAccount;
    type:    "DEPOSIT" | "WITHDRAWAL";
  } | null>(null);
  const [confirmToggle,     setConfirmToggle]      = useState<BankAccount | null>(null);

  // ── Row selection ───────────────────────────────────────────────────────────

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  // ── Pagination ──────────────────────────────────────────────────────────────

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "account_name" });

  // ── Filters ─────────────────────────────────────────────────────────────────

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

  // ── Data fetching ────────────────────────────────────────────────────────────

  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<BankAccount>>({
    queryKey:        ["bank-accounts", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const accounts   = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ── Toggle status mutation ───────────────────────────────────────────────────

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

  // ── Selection helpers ────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = accounts.map((a) => a.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = accounts.filter((a) => selectedKeys.has(a.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ── Export handlers ──────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = { page: 1, page_size: totalItems };
        if (isActiveFilter) exportParams.is_active = isActiveFilter;
        if (search) exportParams.search = search;
        const allData = await apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", exportParams);
        exportSelectedCsv(allData.data);
      } catch {
        showToast("error", "Export Failed", "Could not export records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems);
    }
  }

  function handleExportPdf() {
    exportSelectedPdf(selectedItems);
  }

  // ── Column definitions ───────────────────────────────────────────────────────

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
          LKR {formatAmount(row.current_balance)}
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

          {/* Deposit  always visible */}
          <button
            title="Deposit"
            onClick={(e) => { e.stopPropagation(); setTransactionTarget({ account: row, type: "DEPOSIT" }); }}
            className="p-1.5 rounded-md transition-colors text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>

          {/* Withdraw  always visible */}
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

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isDeactivating = confirmToggle?.is_active === true;

  return (
    <div className="page-container">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
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
            placeholder="Search by account name, bank..."
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

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
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

      {/* ── Table card ──────────────────────────────────────────────────────── */}
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

        <DataTable<BankAccount>
          columns={columns}
          data={accounts}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No accounts found matching "${search}"` : "No bank accounts found."}
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

        {/* Selection action bar */}
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

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
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
