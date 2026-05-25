"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Stethoscope, Plus, Upload, Eye, Pencil, FileDown, XCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { ImportModal }            from "@/components/common/ImportModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { getActiveStatusVariant } from "@/lib/badges";
import { ACTIVE_STATUS_OPTIONS }  from "@/lib/constants";
import { DoctorModal }     from "./components/DoctorModal";
import { DoctorViewModal } from "./components/DoctorViewModal";
import type { Doctor, PaginatedResponse, ImportResult } from "@/types";

export default function DoctorsPage() {
  const { permissions } = useAuth();
  const canManage = (
    permissions?.isBranchManager || permissions?.isBranchAdmin ||
    permissions?.isManager       || permissions?.isAdmin
  ) ?? false;

  const [statusFilter,  setStatusFilter]  = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [viewDoctor,    setViewDoctor]    = useState<Doctor | null>(null);
  const [confirmDoctor, setConfirmDoctor] = useState<Doctor | null>(null);
  const [importOpen,    setImportOpen]    = useState(false);
  const [selectedKeys,  setSelectedKeys]  = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv, setIsExportingCsv]     = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "name", initialSortDirection: "asc" });

  const filters           = statusFilter ? { is_active: statusFilter } : {};
  const hasActiveFilters  = statusFilter !== "";
  const activeFilterCount = statusFilter ? 1 : 0;

  function clearFilters() { setStatusFilter(""); goToPage(1); }

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<Doctor>>({
    queryKey:        ["doctors", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<Doctor>>("/doctors", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const toggleMutation = useMutation({
    mutationFn: (doctor: Doctor) => apiPatch<Doctor>(`/doctors/${doctor.id}`, { is_active: !doctor.is_active }),
    onSuccess: (_, doctor) => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      showToast("success", doctor.is_active ? "Doctor Deactivated" : "Doctor Activated",
        doctor.is_active ? `${doctor.name} has been deactivated.` : `${doctor.name} is now active.`);
      setConfirmDoctor(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys   = items.map((d) => d.id);
  const allOnPageSelected = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  const selectedItems  = items.filter((d) => selectedKeys.has(d.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter) exportParams.is_active = statusFilter;
        if (search)       exportParams.search    = search;
        const blob = await apiDownloadFile("/doctors/export", exportParams);
        downloadBlob(blob, `doctors_${format(new Date(), "yyyy-MM-dd")}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export doctor records.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      const csvText = [
        ["Name", "Specialization", "Hospital / Clinic", "License Number", "Phone", "Status"],
        ...selectedItems.map((d) => [d.name, d.specialization, d.hospital_or_clinic, d.license_number, d.phone, d.is_active ? "Active" : "Inactive"]),
      ].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
      downloadBlob(new Blob([csvText], { type: "text/csv;charset=utf-8;" }), `doctors_${format(new Date(), "yyyy-MM-dd")}.csv`);
    }
  }

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/doctors/import", file);
    queryClient.invalidateQueries({ queryKey: ["doctors"] });
    return result;
  }

  const columns: Column<Doctor>[] = [
    {
      key: "name", header: "Doctor", sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{row.name}</p>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--color-text-muted)" }}>{row.license_number}</p>
        </div>
      ),
    },
    { key: "specialization", header: "Specialization", sortable: true, render: (row) => <span className="text-sm" style={{ color: "var(--color-text)" }}>{row.specialization}</span> },
    { key: "hospital_or_clinic", header: "Hospital / Clinic", render: (row) => <span className="text-sm" style={{ color: "var(--color-text)" }}>{row.hospital_or_clinic}</span> },
    { key: "phone", header: "Phone", render: (row) => <span className="text-sm font-mono" style={{ color: "var(--color-text-muted)" }}>{row.phone}</span> },
    {
      key: "is_active", header: "Status",
      render: (row) => <Badge variant={getActiveStatusVariant(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "actions", header: "", width: "110px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button title="View Details" onClick={(e) => { e.stopPropagation(); setViewDoctor(row); }}
                  className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]" style={{ color: "var(--color-text-muted)" }}>
            <Eye className="w-3.5 h-3.5" />
          </button>
          {canManage && (
            <>
              <button title="Edit Doctor" onClick={(e) => { e.stopPropagation(); setEditingDoctor(row); setModalOpen(true); }}
                      className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]" style={{ color: "var(--color-text-muted)" }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button title={row.is_active ? "Deactivate" : "Activate"} onClick={(e) => { e.stopPropagation(); setConfirmDoctor(row); }}
                      className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                      style={{ color: row.is_active ? "var(--color-danger)" : "var(--color-success)" }}>
                {row.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Stethoscope className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Doctors</h1>
          </div>
          <p className="page-subtitle mt-1">Manage registered doctors for prescriptions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SearchBar placeholder="Search by name, specialization, or hospital…" onSearch={handleSearch} className="w-[28rem] max-w-full" />
          <div className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0" style={{ borderColor: "var(--color-border)" }}>
            <Button variant={filterVisible ? "primary" : "outline"} size="sm" onClick={() => setFilterVisible((v) => !v)}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
            {canManage && <Button variant="primary" leftIcon={<Upload className="w-4 h-4" />} onClick={() => setImportOpen(true)}>Import</Button>}
            {canManage && <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditingDoctor(null); setModalOpen(true); }}>Add Doctor</Button>}
          </div>
        </div>
      </div>

      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={() => { clearFilters(); setFilterVisible(false); }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }} className="form-select w-auto">
          {ACTIVE_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </FilterBar>

      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        {showSelectAllBanner && (
          <div className="px-4 py-2 text-sm text-center border-b" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
            <span style={{ color: "var(--color-text-muted)" }}>{pagination.pageSize} records on this page are selected. </span>
            <button onClick={() => setAllPagesSelected(true)} className="font-semibold text-primary-500 hover:underline">Select all {totalItems} records</button>
          </div>
        )}
        {allPagesSelected && (
          <div className="px-4 py-2 text-sm text-center border-b" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
            <span className="font-semibold text-primary-500">All {totalItems} records selected.</span>{" "}
            <button onClick={() => { setSelectedKeys(new Set()); setAllPagesSelected(false); }} className="hover:underline" style={{ color: "var(--color-text-muted)" }}>Clear selection</button>
          </div>
        )}
        <DataTable<Doctor>
          columns={columns} data={items} isLoading={isLoading} rowKey={(row) => row.id}
          sort={sort} onSort={handleSort}
          emptyMessage={search ? `No doctors found matching "${search}"` : "No doctors found."}
          selectable selectedKeys={selectedKeys} onSelectionChange={handleSelectionChange}
        />
        <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {totalItems > 0 && (
            <Pagination currentPage={pagination.page} totalPages={totalPages} totalRecords={totalItems}
                        pageSize={pagination.pageSize} onPageChange={goToPage} onPageSizeChange={changePageSize} />
          )}
        </div>
        {(selectedKeys.size > 0 || allPagesSelected) && (
          <div className="border-t flex items-center justify-between px-4 py-3 gap-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{selectionCount} record{selectionCount !== 1 ? "s" : ""} selected</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" leftIcon={<FileDown className="w-3.5 h-3.5" />} onClick={handleExportCsv} isLoading={isExportingCsv}>Export CSV</Button>
              <button onClick={() => { setSelectedKeys(new Set()); setAllPagesSelected(false); }} className="text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--color-surface)]" style={{ color: "var(--color-text-muted)" }}>Clear</button>
            </div>
          </div>
        )}
      </div>

      <DoctorModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingDoctor(null); }} editingDoctor={editingDoctor} />
      <DoctorViewModal isOpen={!!viewDoctor} onClose={() => setViewDoctor(null)} doctor={viewDoctor} />
      <ConfirmModal
        isOpen={!!confirmDoctor} onClose={() => setConfirmDoctor(null)}
        onConfirm={() => { if (confirmDoctor) toggleMutation.mutate(confirmDoctor); }}
        isLoading={toggleMutation.isPending}
        title={confirmDoctor?.is_active ? "Deactivate Doctor" : "Activate Doctor"}
        body={confirmDoctor?.is_active ? `Deactivate ${confirmDoctor.name}?` : `Activate ${confirmDoctor?.name}?`}
        confirmLabel={confirmDoctor?.is_active ? "Deactivate" : "Activate"}
        variant={confirmDoctor?.is_active ? "danger" : "primary"}
      />
      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} entityName="Doctors"
                   onImport={handleImport} onDownloadTemplate={async () => { const blob = await apiDownloadFile("/doctors/import/template"); downloadBlob(blob, "doctors_import_template.csv"); }}
                   templateNote="Required columns: name, specialization, hospital_or_clinic, license_number, phone" />
    </div>
  );
}
