"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Vault, Plus, Pencil, SlidersHorizontal,
  Eye, Trash2, CheckCircle, LockOpen, Lock,
  ArrowDownToLine, ArrowUpFromLine,
  FileDown, FileText,
} from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { formatAmount }           from "@/lib/utils";
import { ACTIVE_STATUS_OPTIONS }  from "@/lib/constants";
import APP_CONFIG                 from "@/lib/config";
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

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(registry: CashRegistry): string[] {
  return [
    registry.name,
    registry.branch_name,
    `LKR ${formatAmount(registry.current_balance)}`,
    registry.is_open ? "Open" : "Closed",
    registry.is_active ? "Active" : "Inactive",
    registry.responsible_staff_name ?? "",
  ];
}

function exportSelectedCsv(selected: CashRegistry[]) {
  const header  = ["Registry Name", "Branch", "Balance", "Status", "Active", "Responsible Staff"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(
    new Blob([csvText], { type: "text/csv;charset=utf-8;" }),
    `cash_registries_${exportDateStamp()}.csv`,
  );
}

async function exportSelectedPdf(selected: CashRegistry[]) {
  const doc     = new jsPDF();
  const headers = [["Registry Name", "Branch", "Balance", "Status", "Active", "Responsible Staff"]];
  const body    = selected.map(buildRow);

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
  doc.text("Cash Registries Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head: headers, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`cash_registries_${exportDateStamp()}.pdf`);
}

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

  // ─── Row selection ──────────────────────────────────────────────────────────

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

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

  // ─── Selection helpers ───────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = items.map((i) => i.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() {
    setAllPagesSelected(true);
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setAllPagesSelected(false);
  }

  const selectedItems  = items.filter((i) => selectedKeys.has(i.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ─── Export handlers ─────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = { page: 1, page_size: totalItems };
        if (filterStatus) exportParams.is_active = filterStatus === "true";
        if (search) exportParams.search = search;
        const allData = await apiGet<PaginatedResponse<CashRegistry>>("/treasury/registries", exportParams);
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
          LKR {formatAmount(row.current_balance)}
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

        <DataTable<CashRegistry>
          columns={columns}
          data={items}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No registries found matching "${search}"` : "No cash registries found."}
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
