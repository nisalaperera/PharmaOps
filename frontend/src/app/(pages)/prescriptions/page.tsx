"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { ClipboardList, Plus, SlidersHorizontal, Eye, XCircle, CheckCircle2, FileDown, FileText } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import APP_CONFIG from "@/lib/config";
import { DataTable, type Column }  from "@/components/common/DataTable";
import { Pagination }               from "@/components/common/Pagination";
import { SearchBar }                from "@/components/common/SearchBar";
import { FilterBar }                from "@/components/common/FilterBar";
import { Button }                   from "@/components/ui/Button";
import { Badge }                    from "@/components/ui/Badge";
import { ConfirmModal }             from "@/components/ui/ConfirmModal";
import { useAuth }                  from "@/hooks/useAuth";
import { usePagination }            from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }                from "@/lib/toast";
import { daysUntilExpiry }          from "@/lib/utils";
import { getActiveStatusVariant }   from "@/lib/badges";
import { ACTIVE_STATUS_OPTIONS }    from "@/lib/constants";
import { PrescriptionModal }        from "@/app/(pages)/prescriptions/components/PrescriptionModal";
import { PrescriptionViewModal }    from "@/app/(pages)/prescriptions/components/PrescriptionViewModal";
import type { Prescription, Branch, PaginatedResponse } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(rx: Prescription): string[] {
  return [
    rx.patient_name,
    rx.doctor_name,
    rx.prescription_date,
    rx.expiry_date,
    String(rx.items.length),
    String(rx.usage_count),
    rx.is_active ? "Active" : "Inactive",
  ];
}

function exportSelectedCsv(selected: Prescription[]) {
  const header  = ["Patient", "Doctor", "Prescription Date", "Expiry Date", "Items", "Usage Count", "Status"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `prescriptions_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: Prescription[], branchName?: string) {
  const doc  = new jsPDF();
  const head = [["Patient", "Doctor", "Rx Date", "Expiry Date", "Items", "Usage", "Status"]];
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

  if (branchName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Branch: ${branchName}`, 28, cursorY);
    cursorY += 6;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Prescriptions Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });

  const branchSlug = branchName ? `_${branchName.toLowerCase().replace(/\s+/g, "_")}` : "";
  doc.save(`prescriptions${branchSlug}_${exportDateStamp()}.pdf`);
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function PrescriptionsPage() {
  const { permissions } = useAuth();
  const canCreate = true;
  const canToggle = (permissions?.isBranchManager || permissions?.isBranchAdmin || permissions?.isManager || permissions?.isAdmin) ?? false;

  // ── Filter state
  const [filterBranch, setFilterBranch] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  // ── Modal state
  const [modalOpen,             setModalOpen]             = useState(false);
  const [viewPrescription,      setViewPrescription]      = useState<Prescription | null>(null);
  const [confirmPrescription,   setConfirmPrescription]   = useState<Prescription | null>(null);
  const [isExportingCsv,        setIsExportingCsv]        = useState(false);

  // ── Row selection
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);

  // ── Pagination
  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at", initialSortDirection: "desc" });

  const filters = {
    ...(filterBranch && { branch_id: filterBranch }),
    ...(filterActive !== "" && { is_active: filterActive }),
  };

  const hasActiveFilters  = filterBranch !== "" || filterActive !== "";
  const activeFilterCount = (filterBranch ? 1 : 0) + (filterActive ? 1 : 0);

  function clearFilters() {
    setFilterBranch(""); setFilterActive("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // ── Data fetching
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<Prescription>>({
    queryKey:        ["prescriptions", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<Prescription>>("/prescriptions", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches-filter"],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: true, page_size: 100 }),
    enabled:  permissions?.isOrgLevel ?? false,
    staleTime: 300_000,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const branches   = branchesData?.data ?? [];

  const branchNameMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));

  // ── Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: (rx: Prescription) =>
      apiPatch<Prescription>(`/prescriptions/${rx.id}`, { is_active: !rx.is_active }),
    onSuccess: (_, rx) => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      showToast(
        "success",
        rx.is_active ? "Prescription Deactivated" : "Prescription Activated",
        rx.is_active
          ? `${rx.patient_name}'s prescription has been deactivated.`
          : `${rx.patient_name}'s prescription is now active.`,
      );
      setConfirmPrescription(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // ── Selection helpers
  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = items.map((i) => i.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = items.filter((i) => selectedKeys.has(i.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ── Export handlers
  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (filterBranch) exportParams.branch_id = filterBranch;
        if (filterActive !== "") exportParams.is_active = filterActive;
        if (search) exportParams.search = search;
        const blob = await apiDownloadFile("/prescriptions/export", exportParams);
        downloadBlob(blob, `prescriptions_${exportDateStamp()}.csv`);
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
    const branchName = filterBranch ? branchNameMap[filterBranch] : undefined;
    exportSelectedPdf(selectedItems, branchName);
  }

  // ── Column definitions
  const columns: Column<Prescription>[] = [
    {
      key:      "patient_name",
      header:   "Patient",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.patient_name || "—"}
          </p>
          {permissions?.isOrgLevel && (
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {branchNameMap[row.branch_id] ?? row.branch_id}
            </p>
          )}
        </div>
      ),
    },
    {
      key:      "doctor_name",
      header:   "Doctor",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>
          {row.doctor_name || "—"}
        </span>
      ),
    },
    {
      key:      "prescription_date",
      header:   "Dates",
      sortable: true,
      render:   (row) => {
        const days = daysUntilExpiry(row.expiry_date);
        const expiryColor =
          days <= 0   ? "var(--color-danger-500)"
          : days <= 7 ? "#f59e0b"
          : "var(--color-text-muted)";
        return (
          <div>
            <p className="text-sm" style={{ color: "var(--color-text)" }}>
              {row.prescription_date}
            </p>
            <p className="text-xs mt-0.5" style={{ color: expiryColor }}>
              Exp: {row.expiry_date}
              {days <= 0   ? " · Expired"
               : days <= 7 ? ` · ${days}d left`
               : ""}
            </p>
          </div>
        );
      },
    },
    {
      key:    "items",
      header: "Items",
      render: (row) => (
        <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {row.items.length}
        </span>
      ),
    },
    {
      key:    "usage_count",
      header: "Usage",
      render: (row) => (
        <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {row.usage_count}
        </span>
      ),
    },
    {
      key:    "is_active",
      header: "Status",
      render: (row) => (
        <Badge variant={getActiveStatusVariant(row.is_active)}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "88px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewPrescription(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canToggle && (
            <button
              title={row.is_active ? "Deactivate" : "Activate"}
              onClick={(e) => { e.stopPropagation(); setConfirmPrescription(row); }}
              className={
                row.is_active
                  ? "p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  : "p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }
            >
              {row.is_active
                ? <XCircle className="w-3.5 h-3.5" />
                : <CheckCircle2 className="w-3.5 h-3.5" />
              }
            </button>
          )}
        </div>
      ),
    },
  ];

  const isDeactivating = confirmPrescription?.is_active === true;

  // ── Render
  return (
    <div className="page-container">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Prescription Management</h1>
          </div>
          <p className="page-subtitle mt-1">Manage patient prescriptions and track dispensing usage</p>
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
            placeholder="Search by patient or doctor…"
            onSearch={handleSearch}
            className="w-[28rem] max-w-full"
          />

          {canCreate && (
            <div
              className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Button
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setModalOpen(true)}
              >
                New Prescription
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        {permissions?.isOrgLevel && (
          <select
            value={filterBranch}
            onChange={(e) => { setFilterBranch(e.target.value); goToPage(1); }}
            className="form-select w-auto"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <select
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {ACTIVE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      {/* ── Table card ───────────────────────────────────────────────────────── */}
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

        <DataTable<Prescription>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No prescriptions found matching "${search}"` : "No prescriptions found."}
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

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <PrescriptionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      <PrescriptionViewModal
        isOpen={!!viewPrescription}
        onClose={() => setViewPrescription(null)}
        prescription={viewPrescription}
        branchNameMap={branchNameMap}
      />

      <ConfirmModal
        isOpen={!!confirmPrescription}
        onClose={() => setConfirmPrescription(null)}
        title={isDeactivating ? "Deactivate Prescription" : "Activate Prescription"}
        body={
          isDeactivating ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmPrescription?.patient_name}
              </span>
              &apos;s prescription? It will no longer be available for dispensing.
            </>
          ) : (
            <>
              Activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmPrescription?.patient_name}
              </span>
              &apos;s prescription?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmPrescription && toggleMutation.mutate(confirmPrescription)}
        isLoading={toggleMutation.isPending}
      />
    </div>
  );
}
