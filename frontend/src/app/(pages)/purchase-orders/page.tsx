"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  ShoppingCart, Plus, Eye, Pencil, SlidersHorizontal,
  FileDown, FileText, Send, CheckCircle2, Ban,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPost, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { PO_STATUS_FILTER_OPTIONS } from "@/lib/constants";
import { PO_STATUS_LABEL, PO_STATUS_VARIANT } from "@/lib/badges";
import APP_CONFIG                 from "@/lib/config";
import { POModal }                from "./components/POModal";
import { POViewModal }            from "./components/POViewModal";
import type { PurchaseOrder, Branch, PaginatedResponse } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(po: PurchaseOrder, branchNameMap: Record<string, string>): string[] {
  return [
    `#${po.id.slice(0, 8).toUpperCase()}`,
    branchNameMap[po.branch_id] ?? po.branch_id,
    po.supplier_name,
    po.channel_name,
    String(po.items.length),
    po.total_amount.toFixed(2),
    PO_STATUS_LABEL[po.status],
    po.created_at.slice(0, 10),
  ];
}

function exportSelectedCsv(selected: PurchaseOrder[], branchNameMap: Record<string, string>) {
  const header  = ["PO Number", "Branch", "Supplier", "Channel", "Items", "Total", "Status", "Created"];
  const rows    = selected.map((po) => buildRow(po, branchNameMap));
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `purchase_orders_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: PurchaseOrder[], branchNameMap: Record<string, string>) {
  const doc  = new jsPDF();
  const head = [["PO Number", "Branch", "Supplier", "Total", "Status", "Created"]];
  const body = selected.map((po) => [
    `#${po.id.slice(0, 8).toUpperCase()}`,
    branchNameMap[po.branch_id] ?? po.branch_id,
    po.supplier_name,
    po.total_amount.toFixed(2),
    PO_STATUS_LABEL[po.status],
    po.created_at.slice(0, 10),
  ]);

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
  doc.text("Purchase Orders — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`purchase_orders_${exportDateStamp()}.pdf`);
}

// ─── Workflow action type ─────────────────────────────────────────────────────

type POAction = "submit" | "approve" | "cancel";

const ACTION_CONFIG: Record<POAction, {
  title:        (name: string) => string;
  body:         (name: string) => string;
  confirmLabel: string;
  variant:      "primary" | "danger";
  toast:        string;
}> = {
  submit: {
    title:        (n) => `Submit "${n}" for Approval`,
    body:         () => "This will send the order to a manager for review. You will not be able to edit it after submission.",
    confirmLabel: "Submit",
    variant:      "primary",
    toast:        "submitted for approval",
  },
  approve: {
    title:        (n) => `Approve "${n}"`,
    body:         () => "Approving this order authorises it to be placed with the supplier.",
    confirmLabel: "Approve",
    variant:      "primary",
    toast:        "approved",
  },
  cancel: {
    title:        (n) => `Cancel "${n}"`,
    body:         () => "This action cannot be undone. The order will be permanently cancelled.",
    confirmLabel: "Cancel Order",
    variant:      "danger",
    toast:        "cancelled",
  },
};

// ─── Page component ───────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const { permissions } = useAuth();
  const canManage   = permissions?.can("BRANCH_USER")    ?? false;
  const canApprove  = permissions?.can("BRANCH_MANAGER") ?? false;

  // — Filters
  const [statusFilter, setStatusFilter]  = useState("");
  const [branchFilter, setBranchFilter]  = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  // — Modal state
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editingPO,    setEditingPO]    = useState<PurchaseOrder | null>(null);
  const [viewPO,       setViewPO]       = useState<PurchaseOrder | null>(null);
  const [pendingAction, setPendingAction] = useState<{ po: PurchaseOrder; type: POAction } | null>(null);

  // — Row selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  // — Pagination
  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at", initialSortDirection: "desc" });

  // — Filters object
  const filters = {
    ...(statusFilter && { status:    statusFilter }),
    ...(branchFilter && { branch_id: branchFilter }),
  };

  const hasActiveFilters  = statusFilter !== "" || branchFilter !== "";
  const activeFilterCount = (statusFilter ? 1 : 0) + (branchFilter ? 1 : 0);

  function clearFilters() {
    setStatusFilter(""); setBranchFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // — Data fetching
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<PurchaseOrder>>({
    queryKey: ["purchase-orders", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<PurchaseOrder>>("/purchase-orders", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // Branches for filter dropdown (org-level only)
  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches-select"],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { page_size: 200 }),
    enabled:  permissions?.isOrgLevel ?? false,
  });
  const branches      = branchesData?.data ?? [];
  const branchNameMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));

  // — Workflow action mutation
  const actionMutation = useMutation({
    mutationFn: ({ po, type }: { po: PurchaseOrder; type: POAction }) =>
      apiPost<PurchaseOrder>(`/purchase-orders/${po.id}/${type}`),
    onSuccess: (_, { po, type }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast(
        "success",
        "Order Updated",
        `Purchase order #${po.id.slice(0, 8).toUpperCase()} has been ${ACTION_CONFIG[type].toast}.`,
      );
      setPendingAction(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Action Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // — Selection helpers
  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = items.map((i) => i.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = items.filter((i) => selectedKeys.has(i.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // — Export handlers
  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter) exportParams.status    = statusFilter;
        if (branchFilter) exportParams.branch_id = branchFilter;
        if (search)       exportParams.search    = search;
        const blob = await apiDownloadFile("/purchase-orders/export", exportParams);
        downloadBlob(blob, `purchase_orders_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems, branchNameMap);
    }
  }

  async function handleExportPdf() {
    await exportSelectedPdf(selectedItems, branchNameMap);
  }

  // — Columns
  const columns: Column<PurchaseOrder>[] = [
    {
      key:    "id",
      header: "PO Number",
      render: (row) => (
        <span className="text-sm font-mono font-semibold" style={{ color: "var(--color-text)" }}>
          #{row.id.slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    ...(permissions?.isOrgLevel ? [{
      key:    "branch_id",
      header: "Branch",
      render: (row: PurchaseOrder) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {branchNameMap[row.branch_id] ?? row.branch_id}
        </span>
      ),
    }] as Column<PurchaseOrder>[] : []),
    {
      key:      "supplier_name",
      header:   "Supplier",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.supplier_name || "—"}
          </p>
          {row.channel_name && (
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {row.channel_name}
            </p>
          )}
        </div>
      ),
    },
    {
      key:      "total_amount",
      header:   "Total",
      sortable: true,
      render:   (row) => (
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
          {row.total_amount.toFixed(2)}
        </span>
      ),
    },
    {
      key:      "status",
      header:   "Status",
      sortable: true,
      render:   (row) => (
        <Badge variant={PO_STATUS_VARIANT[row.status]}>
          {PO_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key:      "created_at",
      header:   "Created",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.created_at.slice(0, 10)}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "140px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          {/* View */}
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewPO(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {/* Edit — DRAFT only */}
          {row.status === "DRAFT" && canManage && (
            <button
              title="Edit Order"
              onClick={(e) => { e.stopPropagation(); setEditingPO(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          <span className="w-px h-4 mx-0.5 flex-shrink-0" style={{ background: "var(--color-border)" }} />

          {/* Submit — DRAFT only */}
          {row.status === "DRAFT" && canManage && (
            <button
              title="Submit for Approval"
              onClick={(e) => { e.stopPropagation(); setPendingAction({ po: row, type: "submit" }); }}
              className="p-1.5 rounded-md transition-colors text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Approve — PENDING_APPROVAL only, BRANCH_MANAGER+ */}
          {row.status === "PENDING_APPROVAL" && canApprove && (
            <button
              title="Approve Order"
              onClick={(e) => { e.stopPropagation(); setPendingAction({ po: row, type: "approve" }); }}
              className="p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Cancel — DRAFT or PENDING_APPROVAL */}
          {(row.status === "DRAFT" || row.status === "PENDING_APPROVAL") && canManage && (
            <button
              title="Cancel Order"
              onClick={(e) => { e.stopPropagation(); setPendingAction({ po: row, type: "cancel" }); }}
              className="p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const actionCfg  = pendingAction ? ACTION_CONFIG[pendingAction.type] : null;
  const poShortId  = pendingAction ? `#${pendingAction.po.id.slice(0, 8).toUpperCase()}` : "";

  return (
    <div className="page-container">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Purchase Orders</h1>
          </div>
          <p className="page-subtitle mt-1">Manage and track purchase orders across branches</p>
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
            placeholder="Search by supplier or channel…"
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
                onClick={() => { setEditingPO(null); setModalOpen(true); }}
              >
                New Order
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {PO_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {permissions?.isOrgLevel && (
          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); goToPage(1); }}
            className="form-select w-auto"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
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

        <DataTable<PurchaseOrder>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No purchase orders found matching "${search}"` : "No purchase orders found."}
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

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <POModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingPO(null); }}
        editingPO={editingPO}
      />

      <POViewModal
        isOpen={!!viewPO}
        onClose={() => setViewPO(null)}
        po={viewPO}
        branchNameMap={branchNameMap}
      />

      {/* Workflow action confirm modal */}
      {pendingAction && actionCfg && (
        <ConfirmModal
          isOpen
          onClose={() => setPendingAction(null)}
          title={actionCfg.title(poShortId)}
          body={<>{actionCfg.body(poShortId)}</>}
          confirmLabel={actionCfg.confirmLabel}
          variant={actionCfg.variant}
          onConfirm={() => actionMutation.mutate(pendingAction)}
          isLoading={actionMutation.isPending}
        />
      )}
    </div>
  );
}
