"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Users, Plus, Pencil, Upload, SlidersHorizontal,
  Eye, Trash2, FileDown, FileText, Smartphone, MessageCircle, Mail,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { StatusBadge }            from "@/components/ui/StatusBadge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { ImportModal }            from "@/components/common/ImportModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { getStaffDisplayName }    from "@/lib/utils";
import { ACTIVE_STATUS_OPTIONS }  from "@/lib/constants";
import APP_CONFIG from "@/lib/config";
import { StaffModal }     from "@/app/(pages)/staff/components/StaffModal";
import { StaffViewModal } from "@/app/(pages)/staff/components/StaffViewModal";
import type { Staff, Branch, PaginatedResponse, ImportResult } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function buildStaffRow(staff: Staff, branchNameMap: Record<string, string>): string[] {
  return [
    staff.title ?? "",
    staff.first_name,
    staff.last_name,
    staff.role,
    staff.mobile_1,
    staff.mobile_2        ?? "",
    staff.landline        ?? "",
    staff.whatsapp_number ?? "",
    staff.email           ?? "",
    staff.epf_no          ?? "",
    staff.id_number       ?? "",
    staff.is_active ? "Active" : "Inactive",
    branchNameMap[staff.branch_id] ?? staff.branch_id,
  ];
}

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const CSV_HEADERS = [
  "Title", "First Name", "Last Name", "Job Title",
  "Mobile 1", "Mobile 2", "Landline", "WhatsApp",
  "Email", "EPF No", "ID Number", "Status", "Branch",
];

function exportSelectedCsv(selected: Staff[], branchNameMap: Record<string, string>) {
  const rows    = selected.map((s) => buildStaffRow(s, branchNameMap));
  const csvText = [CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `staff_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(
  selected: Staff[],
  branchNameMap: Record<string, string>,
  branchName?: string,
) {
  const doc  = new jsPDF();
  const head = [CSV_HEADERS];
  const body = selected.map((s) => buildStaffRow(s, branchNameMap));

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

  if (branchName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Branch: ${branchName}`, 28, cursorY);
    cursorY += 6;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Staff Members Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 7 } });

  const branchSlug = branchName ? `_${branchName.toLowerCase().replace(/\s+/g, "_")}` : "";
  doc.save(`staff${branchSlug}_${exportDateStamp()}.pdf`);
}

// ─── Staff page ───────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { permissions } = useAuth();
  const canManage = permissions?.isAdmin || permissions?.isManager || permissions?.isBranchAdmin;

  // — Filters
  const [statusFilter,  setStatusFilter]  = useState("");
  const [branchFilter,  setBranchFilter]  = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  // — Modals
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingStaff,  setEditingStaff]  = useState<Staff | null>(null);
  const [viewStaff,     setViewStaff]     = useState<Staff | null>(null);
  const [confirmStaff,  setConfirmStaff]  = useState<Staff | null>(null);
  const [importOpen,    setImportOpen]    = useState(false);

  // — Selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "epf_no" });

  const filters = {
    ...(statusFilter && { is_active: statusFilter }),
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

  // ─── Data ────────────────────────────────────────────────────────────────────

  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Staff>>({
    queryKey:        ["staff", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<Staff>>("/staff", { ...queryParams, ...filters }),
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

  // ─── Toggle status ────────────────────────────────────────────────────────────

  const toggleStatusMutation = useMutation({
    mutationFn: (staff: Staff) =>
      apiPatch<Staff>(`/staff/${staff.id}`, { is_active: !staff.is_active }),
    onSuccess: (_, staff) => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      showToast(
        "success",
        staff.is_active ? "Staff Member Deactivated" : "Staff Member Activated",
        staff.is_active
          ? `${getStaffDisplayName(staff)} has been deactivated.`
          : `${getStaffDisplayName(staff)} is now active.`
      );
      setConfirmStaff(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // ─── Selection ───────────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = items.map((s) => s.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = items.filter((s) => selectedKeys.has(s.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ─── Export / Import ─────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter) exportParams.is_active = statusFilter;
        if (branchFilter) exportParams.branch_id = branchFilter;
        if (search)       exportParams.search    = search;
        const blob = await apiDownloadFile("/staff/export", exportParams);
        const branchSlug = currentBranchName ? `_${currentBranchName.toLowerCase().replace(/\s+/g, "_")}` : "";
        downloadBlob(blob, `staff${branchSlug}_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export staff records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems, branchNameMap);
    }
  }

  function handleExportPdf() {
    exportSelectedPdf(selectedItems, branchNameMap, currentBranchName);
  }

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/staff/import", file);
    queryClient.invalidateQueries({ queryKey: ["staff"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/staff/import/template");
    downloadBlob(blob, "staff_import_template.csv");
  }

  // ─── Columns ─────────────────────────────────────────────────────────────────

  const columns: Column<Staff>[] = [
    {
      key:      "last_name",
      header:   "Staff Member",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {[row.title, row.first_name, row.last_name].filter(Boolean).join(" ")}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {row.role}
          </p>
        </div>
      ),
    },
    {
      key:    "mobile_1",
      header: "Contact",
      render: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-3 h-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--color-text)" }}>{row.mobile_1}</span>
          </div>
          {row.mobile_2 && (
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3 h-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{row.mobile_2}</span>
            </div>
          )}
          {row.whatsapp_number && (
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-3 h-3 flex-shrink-0 text-emerald-500" />
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{row.whatsapp_number}</span>
            </div>
          )}
          {row.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="w-3 h-3 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{row.email}</span>
            </div>
          )}
        </div>
      ),
    },
    ...(permissions?.isOrgLevel ? [{
      key:    "branch_id" as const,
      header: "Branch",
      render: (row: Staff) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {branchNameMap[row.branch_id] ?? row.branch_id}
        </span>
      ),
    }] : []),
    {
      key:      "epf_no",
      header:   "EPF No",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: row.epf_no ? "var(--color-text)" : "var(--color-text-muted)" }}>
          {row.epf_no ?? "—"}
        </span>
      ),
    },
    {
      key:      "id_number",
      header:   "ID Number",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: row.id_number ? "var(--color-text)" : "var(--color-text-muted)" }}>
          {row.id_number ?? "—"}
        </span>
      ),
    },
    {
      key:    "is_active",
      header: "Status",
      render: (row) => <StatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "100px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewStaff(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <button
              title="Edit"
              onClick={(e) => { e.stopPropagation(); setEditingStaff(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {canManage && (
            <button
              title={row.is_active ? "Deactivate" : "Activate"}
              onClick={(e) => { e.stopPropagation(); setConfirmStaff(row); }}
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

  const isDeactivating = confirmStaff?.is_active === true;

  return (
    <div className="page-container">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Staff Members</h1>
          </div>
          <p className="page-subtitle mt-1">Manage branch staff and contact details</p>
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
            placeholder="Search by name, title or phone…"
            onSearch={handleSearch}
            className="w-[30rem] max-w-full"
          />

          {canManage && (
            <div
              className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Button variant="primary" leftIcon={<Upload className="w-4 h-4" />} onClick={() => setImportOpen(true)}>
                Import
              </Button>
              <Button
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditingStaff(null); setModalOpen(true); }}
              >
                New Staff
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        {permissions?.isOrgLevel && allBranches.length > 0 && (
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
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {ACTIVE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      {/* ── Table card ─────────────────────────────────────────────────────── */}
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

        <DataTable<Staff>
          columns={columns}
          data={items}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No staff found matching "${search}"` : "No staff members found."}
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

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <StaffModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingStaff(null); }}
        editingStaff={editingStaff}
      />

      <StaffViewModal
        isOpen={!!viewStaff}
        onClose={() => setViewStaff(null)}
        staff={viewStaff}
        branchName={viewStaff ? (branchNameMap[viewStaff.branch_id] ?? undefined) : undefined}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Staff Members"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required columns: branch_id, first_name, last_name, mobile_1, role. Optional: title, mobile_2, landline, whatsapp_number, email, epf_no, id_number, address."
      />

      <ConfirmModal
        isOpen={!!confirmStaff}
        onClose={() => setConfirmStaff(null)}
        title={isDeactivating ? "Deactivate Staff Member" : "Activate Staff Member"}
        body={
          isDeactivating ? (
            <>Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{confirmStaff && getStaffDisplayName(confirmStaff)}</span>?
            </>
          ) : (
            <>Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{confirmStaff && getStaffDisplayName(confirmStaff)}</span>?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmStaff && toggleStatusMutation.mutate(confirmStaff)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
