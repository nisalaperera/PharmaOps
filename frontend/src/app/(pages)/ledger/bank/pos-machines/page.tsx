"use client";

import { useState, useCallback }      from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  CreditCard, Plus, Pencil, Eye, CheckCircle, Trash2, SlidersHorizontal, Banknote,
  FileDown, FileText,
} from "lucide-react";
import { format }                      from "date-fns";
import jsPDF                           from "jspdf";
import autoTable                       from "jspdf-autotable";
import APP_CONFIG                      from "@/lib/config";
import { DataTable, type Column }      from "@/components/common/DataTable";
import { Pagination }                  from "@/components/common/Pagination";
import { SearchBar }                   from "@/components/common/SearchBar";
import { FilterBar }                   from "@/components/common/FilterBar";
import { Button }                      from "@/components/ui/Button";
import { Badge }                       from "@/components/ui/Badge";
import { ConfirmModal }                from "@/components/ui/ConfirmModal";
import { useAuth }                     from "@/hooks/useAuth";
import { usePagination }               from "@/hooks/usePagination";
import { apiGet, apiPatch, downloadBlob } from "@/lib/api-client";
import { showToast }                   from "@/lib/toast";
import { ACTIVE_STATUS_OPTIONS }       from "@/lib/constants";
import { getActiveStatusVariant }      from "@/lib/badges";
import { formatAmount, formatDateTime } from "@/lib/utils";
import { PosMachineModal }             from "./components/PosMachineModal";
import { PosMachineViewModal }         from "./components/PosMachineViewModal";
import { PosSettleModal }              from "./components/PosSettleModal";
import type { BankAccount, PosMachine, PaginatedResponse } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(machine: PosMachine): string[] {
  return [
    machine.terminal_id,
    machine.merchant_id ?? "",
    machine.bank_account_name,
    machine.bank_name,
    machine.branch_name,
    `LKR ${formatAmount(machine.unsettled_amount)}`,
    machine.is_active ? "Active" : "Inactive",
  ];
}

function exportSelectedCsv(selected: PosMachine[]) {
  const header  = ["Terminal ID", "Merchant ID", "Bank Account", "Bank", "Branch", "Unsettled Amount", "Status"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `pos_machines_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: PosMachine[]) {
  const doc  = new jsPDF();
  const head = [["Terminal ID", "Merchant ID", "Bank Account", "Bank", "Branch", "Unsettled Amount", "Status"]];
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
  doc.text("POS Machines Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });

  doc.save(`pos_machines_${exportDateStamp()}.pdf`);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PosMachinesPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;
  const queryClient     = useQueryClient();

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [accountFilter,  setAccountFilter]  = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState("");
  const [filterVisible,  setFilterVisible]  = useState(false);

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [modalOpen,       setModalOpen]       = useState(false);
  const [editingMachine,  setEditingMachine]  = useState<PosMachine | null>(null);
  const [viewingMachine,  setViewingMachine]  = useState<PosMachine | null>(null);
  const [settlingMachine, setSettlingMachine] = useState<PosMachine | null>(null);
  const [confirmToggle,   setConfirmToggle]   = useState<PosMachine | null>(null);

  // ── Row selection ────────────────────────────────────────────────────────────
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  // ── Pagination ───────────────────────────────────────────────────────────────
  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at" });

  const filters = {
    ...(accountFilter  && { bank_account_id: accountFilter }),
    ...(isActiveFilter && { is_active: isActiveFilter }),
  };
  const activeFilterCount = [accountFilter, isActiveFilter].filter(Boolean).length;
  const hasActiveFilters  = activeFilterCount > 0;

  function clearFilters() {
    setAccountFilter("");
    setIsActiveFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<PosMachine>>({
    queryKey:        ["pos-machines", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<PosMachine>>("/treasury/bank-accounts/pos-machines/machines", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const { data: accountsData } = useQuery<PaginatedResponse<BankAccount>>({
    queryKey: ["bank-accounts-active"],
    queryFn:  () => apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", { is_active: "true", page_size: 200 }),
    enabled:  filterVisible,
  });
  const activeAccounts = accountsData?.data ?? [];

  const machines   = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ── Toggle active ─────────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: (machine: PosMachine) =>
      apiPatch<PosMachine>(`/treasury/bank-accounts/pos-machines/machines/${machine.id}`, { is_active: !machine.is_active }),
    onSuccess: (_, machine) => {
      queryClient.invalidateQueries({ queryKey: ["pos-machines"] });
      showToast(
        "success",
        machine.is_active ? "POS Machine Deactivated" : "POS Machine Activated",
        machine.is_active
          ? `TID ${machine.terminal_id} has been deactivated.`
          : `TID ${machine.terminal_id} is now active.`,
      );
      setConfirmToggle(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  // ── Selection helpers ─────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = machines.map((m) => m.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = machines.filter((m) => selectedKeys.has(m.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ── Export handlers ───────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const allData = await apiGet<PaginatedResponse<PosMachine>>("/treasury/bank-accounts/pos-machines/machines", {
          ...queryParams,
          ...filters,
          page: 1,
          page_size: totalItems,
        });
        exportSelectedCsv(allData.data);
      } catch {
        showToast("error", "Export Failed", "Could not export POS machines. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems);
    }
  }

  async function handleExportPdf() {
    await exportSelectedPdf(selectedItems);
  }

  // ── Columns ───────────────────────────────────────────────────────────────────
  const columns: Column<PosMachine>[] = [
    {
      key:      "terminal_id",
      header:   "Terminal",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text)" }}>
            {row.terminal_id}
          </p>
          {row.merchant_id && (
            <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--color-text-muted)" }}>
              MID: {row.merchant_id}
            </p>
          )}
        </div>
      ),
    },
    {
      key:    "bank_account_name",
      header: "Bank Account",
      render: (row) => (
        <div>
          <p className="text-sm" style={{ color: "var(--color-text)" }}>{row.bank_account_name}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{row.bank_name}</p>
        </div>
      ),
    },
    {
      key:    "branch_name",
      header: "Branch",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{row.branch_name}</span>
      ),
    },
    {
      key:      "unsettled_amount",
      header:   "Unsettled",
      sortable: true,
      render:   (row) => (
        <span
          className="text-sm tabular-nums font-semibold"
          style={{ color: row.unsettled_amount > 0 ? "var(--color-text)" : "var(--color-text-muted)" }}
        >
          LKR {formatAmount(row.unsettled_amount)}
        </span>
      ),
    },
    {
      key:    "last_settled_at",
      header: "Last Settled",
      render: (row) => (
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {row.last_settled_at ? formatDateTime(row.last_settled_at) : "—"}
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
      width:  "160px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewingMachine(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && row.is_active && row.unsettled_amount > 0 && (
            <button
              title="Settle"
              onClick={(e) => { e.stopPropagation(); setSettlingMachine(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Banknote className="w-3.5 h-3.5" />
            </button>
          )}

          {canManage && (
            <>
              <span className="w-px h-4 mx-1 flex-shrink-0" style={{ background: "var(--color-border)" }} />
              <button
                title="Edit"
                onClick={(e) => { e.stopPropagation(); setEditingMachine(row); setModalOpen(true); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

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

  const isDeactivating = confirmToggle?.is_active === true;

  return (
    <div className="page-container">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">POS Machines</h1>
          </div>
          <p className="page-subtitle mt-1">Manage POS terminals, log card transactions, and settle to bank accounts</p>
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
            placeholder="Search by terminal ID, bank…"
            onSearch={handleSearch}
            className="w-[24rem] max-w-full"
          />

          {canManage && (
            <div
              className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Button
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditingMachine(null); setModalOpen(true); }}
              >
                Add POS Machine
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={hideFilters}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Bank Account</label>
          <select
            value={accountFilter}
            onChange={(e) => { setAccountFilter(e.target.value); goToPage(1); }}
            className="form-select w-auto"
          >
            <option value="">All Accounts</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_name} — {a.bank_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Status</label>
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

      {/* ── Table ────────────────────────────────────────────────────────────── */}
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

        <DataTable<PosMachine>
          columns={columns}
          data={machines}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          onRowClick={(row) => setViewingMachine(row)}
          emptyMessage={search ? `No POS machines found matching "${search}"` : "No POS machines added yet."}
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

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <PosMachineModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingMachine(null); }}
        editingMachine={editingMachine}
      />

      <PosMachineViewModal
        isOpen={!!viewingMachine}
        onClose={() => setViewingMachine(null)}
        machine={viewingMachine}
        canManage={canManage}
      />

      <PosSettleModal
        isOpen={!!settlingMachine}
        onClose={() => setSettlingMachine(null)}
        machine={settlingMachine}
      />

      <ConfirmModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        title={isDeactivating ? "Deactivate POS Machine" : "Activate POS Machine"}
        body={
          isDeactivating
            ? `Deactivate TID ${confirmToggle?.terminal_id}? No new transactions can be logged on an inactive machine.`
            : `Activate TID ${confirmToggle?.terminal_id}?`
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmToggle && toggleMutation.mutate(confirmToggle)}
        isLoading={toggleMutation.isPending}
      />
    </div>
  );
}
