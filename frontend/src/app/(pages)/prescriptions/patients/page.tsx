"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  UserCircle, Plus, Eye, Pencil, UserX, UserCheck,
  FileDown, FileText, Trash2, SlidersHorizontal,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { SearchBar }               from "@/components/common/SearchBar";
import { FilterBar }               from "@/components/common/FilterBar";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { ConfirmModal }            from "@/components/ui/ConfirmModal";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }               from "@/lib/toast";
import { getActiveStatusVariant }  from "@/lib/badges";
import { ACTIVE_STATUS_OPTIONS, RELATIONSHIP_FILTER_OPTIONS } from "@/lib/constants";
import APP_CONFIG                  from "@/lib/config";
import { PatientModal }     from "./components/PatientModal";
import { PatientViewModal } from "./components/PatientViewModal";
import type { Patient, PaginatedResponse, PatientRelationship } from "@/types";

const RELATIONSHIP_LABEL: Record<string, string> = {
  SELF: "Self", SPOUSE: "Spouse", CHILD: "Child",
  PARENT: "Parent", SIBLING: "Sibling", OTHER: "Other",
};

// ─── Export helpers ───────────────────────────────────────────────────────────

const CSV_HEADERS = ["Patient Name", "Customer", "Relationship", "Date of Birth", "Status"];

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildPatientRow(patient: Patient): string[] {
  return [
    patient.name,
    patient.customer_name,
    RELATIONSHIP_LABEL[patient.relationship] ?? patient.relationship,
    patient.date_of_birth ?? "",
    patient.is_active ? "Active" : "Inactive",
  ];
}

function exportSelectedCsv(selected: Patient[]) {
  const rows    = selected.map(buildPatientRow);
  const csvText = [CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob(
    new Blob([csvText], { type: "text/csv;charset=utf-8;" }),
    `patients_${exportDateStamp()}.csv`,
  );
}

async function exportSelectedPdf(selected: Patient[]) {
  const doc  = new jsPDF();
  const head = [CSV_HEADERS];
  const body = selected.map(buildPatientRow);

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
  doc.text("Patients Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`patients_${exportDateStamp()}.pdf`);
}

// ─── Page component ──────────────────────────────────────────────────────────

interface PatientFilters {
  isActive:     string;
  relationship: PatientRelationship | "";
}

const DEFAULT_FILTERS: PatientFilters = { isActive: "", relationship: "" };

export default function PrescriptionPatientsPage() {
  const queryClient = useQueryClient();

  const [filters, setFilters]       = useState<PatientFilters>(DEFAULT_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);

  const [modalOpen, setModalOpen]         = useState(false);
  const [editPatient, setEditPatient]     = useState<Patient | null>(null);
  const [viewPatient, setViewPatient]     = useState<Patient | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Patient | null>(null);

  // ── Selection + export state
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);
  const [confirmBulkDeactivateOpen, setConfirmBulkDeactivateOpen] = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "name", initialSortDirection: "asc" });

  const queryArgs = {
    ...queryParams,
    is_active:    filters.isActive !== "" ? filters.isActive === "true" : undefined,
    relationship: filters.relationship || undefined,
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey:    ["patients", queryArgs],
    queryFn:     () => apiGet<PaginatedResponse<Patient>>("/patients", queryArgs),
    placeholderData: keepPreviousData,
  });

  const patients   = data?.data ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const hasActiveFilters  = filters.isActive !== "" || filters.relationship !== "";
  const activeFilterCount = (filters.isActive ? 1 : 0) + (filters.relationship ? 1 : 0);
  const clearFilters      = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  function openCreate() { setEditPatient(null); setModalOpen(true); }
  function openEdit(p: Patient) { setEditPatient(p); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditPatient(null); }

  async function handleToggleActive() {
    if (!confirmToggle) return;
    try {
      await apiPatch(`/patients/${confirmToggle.id}`, { is_active: !confirmToggle.is_active });
      showToast("success", confirmToggle.is_active ? "Patient Deactivated" : "Patient Activated", `${confirmToggle.name} has been ${confirmToggle.is_active ? "deactivated" : "activated"}.`);
      refetch();
    } catch (err: unknown) {
      showToast("error", "Update Failed", (err as Error).message);
    } finally {
      setConfirmToggle(null);
    }
  }

  // ── Selection helpers ─────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = patients.map((p) => p.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalCount > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection()       { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = patients.filter((p) => selectedKeys.has(p.id));
  const selectionCount = allPagesSelected ? totalCount : selectedKeys.size;

  // ── Export handlers ─────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (filters.isActive !== "")  exportParams.is_active    = filters.isActive === "true";
        if (filters.relationship)     exportParams.relationship = filters.relationship;
        if (search)                   exportParams.search       = search;
        const blob = await apiDownloadFile("/patients/export", exportParams);
        downloadBlob(blob, `patients_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export patient records. Please try again.");
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

  // ── Bulk deactivate ─────────────────────────────────────────────────────────

  const deactivatableSelected = selectedItems.filter((p) => p.is_active);

  const bulkDeactivateMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(deactivatableSelected.map((p) => apiPatch(`/patients/${p.id}`, { is_active: false })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      showToast(
        "success",
        "Patients Deactivated",
        `${deactivatableSelected.length} patient${deactivatableSelected.length !== 1 ? "s" : ""} deactivated successfully.`,
      );
      clearSelection();
      setConfirmBulkDeactivateOpen(false);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Deactivation Failed", err?.message ?? "Could not deactivate some patients. Please try again.");
    },
  });

  const columns: Column<Patient>[] = [
    {
      key:      "name",
      header:   "Patient",
      sortable: true,
      render:   (p) => (
        <div>
          <p className="font-medium" style={{ color: "var(--color-text)" }}>{p.name}</p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{p.customer_name}</p>
        </div>
      ),
    },
    {
      key:      "relationship",
      header:   "Relationship",
      sortable: true,
      render:   (p) => <span style={{ color: "var(--color-text-muted)" }}>{RELATIONSHIP_LABEL[p.relationship] ?? p.relationship}</span>,
    },
    {
      key:    "date_of_birth",
      header: "Date of Birth",
      render: (p) => <span style={{ color: "var(--color-text-muted)" }}>{p.date_of_birth ?? "—"}</span>,
    },
    {
      key:    "is_active",
      header: "Status",
      render: (p) => (
        <Badge variant={getActiveStatusVariant(p.is_active)} dot>
          {p.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "110px",
      render: (p) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewPatient(p); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            title="Edit"
            onClick={(e) => { e.stopPropagation(); openEdit(p); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            title={p.is_active ? "Deactivate" : "Activate"}
            onClick={(e) => { e.stopPropagation(); setConfirmToggle(p); }}
            className={
              p.is_active
                ? "p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                : "p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            }
          >
            {p.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserCircle className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Patients</h1>
          </div>
          <p className="page-subtitle mt-1">Manage prescription patient profiles</p>
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
            placeholder="Search patient name..."
            onSearch={handleSearch}
            className="w-[24rem] max-w-full"
          />

          <div
            className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
              New Patient
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={() => { clearFilters(); setFilterVisible(false); }}
      >
        <select
          className="form-select w-auto"
          value={filters.isActive}
          onChange={(e) => { setFilters((f) => ({ ...f, isActive: e.target.value })); goToPage(1); }}
        >
          {ACTIVE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          className="form-select w-auto"
          value={filters.relationship}
          onChange={(e) => { setFilters((f) => ({ ...f, relationship: e.target.value as PatientRelationship | "" })); goToPage(1); }}
        >
          {RELATIONSHIP_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              Select all {totalCount} records
            </button>
          </div>
        )}

        {allPagesSelected && (
          <div
            className="px-4 py-2 text-sm text-center border-b"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <span className="font-semibold text-primary-500">All {totalCount} records selected.</span>{" "}
            <button onClick={clearSelection} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>
              Clear selection
            </button>
          </div>
        )}

        <DataTable<Patient>
          data={patients}
          columns={columns}
          rowKey={(p) => p.id}
          isFetching={isFetching}
          sort={{ field: sort.field, direction: sort.direction }}
          onSort={handleSort}
          emptyMessage={search || hasActiveFilters ? "No patients match the current filters." : "No patient profiles found."}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
        />

        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {totalCount > 0 && (
            <Pagination
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              totalRecords={totalCount}
              totalPages={totalPages}
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
              {!allPagesSelected && deactivatableSelected.length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setConfirmBulkDeactivateOpen(true)}
                >
                  Deactivate ({deactivatableSelected.length})
                </Button>
              )}
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
      <PatientModal patient={editPatient} isOpen={modalOpen} onClose={closeModal} />

      <PatientViewModal
        patient={viewPatient}
        isOpen={!!viewPatient}
        onClose={() => setViewPatient(null)}
        onEdit={() => { openEdit(viewPatient!); setViewPatient(null); }}
      />

      <ConfirmModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={handleToggleActive}
        title={confirmToggle?.is_active ? "Deactivate Patient" : "Activate Patient"}
        body={`Are you sure you want to ${confirmToggle?.is_active ? "deactivate" : "activate"} ${confirmToggle?.name}?`}
        confirmLabel={confirmToggle?.is_active ? "Deactivate" : "Activate"}
        variant={confirmToggle?.is_active ? "danger" : "primary"}
      />

      <ConfirmModal
        isOpen={confirmBulkDeactivateOpen}
        onClose={() => setConfirmBulkDeactivateOpen(false)}
        title="Deactivate Patients"
        body={`Are you sure you want to deactivate ${deactivatableSelected.length} active patient${deactivatableSelected.length !== 1 ? "s" : ""}?`}
        confirmLabel="Deactivate"
        variant="danger"
        onConfirm={() => bulkDeactivateMutation.mutate()}
        isLoading={bulkDeactivateMutation.isPending}
      />
    </div>
  );
}
