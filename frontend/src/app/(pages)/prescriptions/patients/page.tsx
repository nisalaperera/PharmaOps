"use client";

import { useState, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { UserCircle, Plus, Eye, Pencil, UserX, UserCheck } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { SearchBar }               from "@/components/common/SearchBar";
import { FilterBar }               from "@/components/common/FilterBar";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { ConfirmModal }            from "@/components/ui/ConfirmModal";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet, apiPatch }        from "@/lib/api-client";
import { showToast }               from "@/lib/toast";
import { getActiveStatusVariant }  from "@/lib/badges";
import { ACTIVE_STATUS_OPTIONS, RELATIONSHIP_FILTER_OPTIONS } from "@/lib/constants";
import { PatientModal }     from "./components/PatientModal";
import { PatientViewModal } from "./components/PatientViewModal";
import type { Patient, PaginatedResponse, PatientRelationship } from "@/types";

const RELATIONSHIP_LABEL: Record<string, string> = {
  SELF: "Self", SPOUSE: "Spouse", CHILD: "Child",
  PARENT: "Parent", SIBLING: "Sibling", OTHER: "Other",
};

interface PatientFilters {
  isActive:     string;
  relationship: PatientRelationship | "";
}

const DEFAULT_FILTERS: PatientFilters = { isActive: "", relationship: "" };

export default function PrescriptionPatientsPage() {
  const [filters, setFilters]       = useState<PatientFilters>(DEFAULT_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);

  const [modalOpen, setModalOpen]         = useState(false);
  const [editPatient, setEditPatient]     = useState<Patient | null>(null);
  const [viewPatient, setViewPatient]     = useState<Patient | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Patient | null>(null);

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

  const hasActiveFilters = filters.isActive !== "" || filters.relationship !== "";
  const clearFilters     = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  function openCreate() { setEditPatient(null); setModalOpen(true); }
  function openEdit(p: Patient) { setEditPatient(p); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditPatient(null); }

  async function handleToggleActive() {
    if (!confirmToggle) return;
    try {
      await apiPatch(`/patients/${confirmToggle.id}`, { is_active: !confirmToggle.is_active });
      showToast("success", confirmToggle.is_active ? "Patient deactivated" : "Patient activated", `${confirmToggle.name} has been ${confirmToggle.is_active ? "deactivated" : "activated"}.`);
      refetch();
    } catch (err: unknown) {
      showToast("error", "Update failed", (err as Error).message);
    } finally {
      setConfirmToggle(null);
    }
  }

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
      header: "",
      render: (p) => (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="sm" leftIcon={<Eye className="w-3.5 h-3.5" />} onClick={() => setViewPatient(p)}>View</Button>
          <Button variant="ghost" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => openEdit(p)}>Edit</Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={p.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            onClick={() => setConfirmToggle(p)}
          >
            {p.is_active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="page-icon">
            <UserCircle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="page-title">Patients</h1>
            <p className="page-subtitle">Manage prescription patient profiles</p>
          </div>
        </div>
        <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
          New Patient
        </Button>
      </div>

      <div className="toolbar">
        <SearchBar defaultValue={search} onSearch={handleSearch} placeholder="Search patient name…" />
        <Button variant={filterVisible ? "primary" : "ghost"} onClick={() => setFilterVisible((v) => !v)}>
          Filters {hasActiveFilters && `(${[filters.isActive, filters.relationship].filter(Boolean).length})`}
        </Button>
      </div>

      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={() => setFilterVisible(false)}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Status</label>
          <select
            className="form-select text-sm"
            value={filters.isActive}
            onChange={(e) => setFilters((f) => ({ ...f, isActive: e.target.value }))}
            style={{ width: 160 }}
          >
            {ACTIVE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Relationship</label>
          <select
            className="form-select text-sm"
            value={filters.relationship}
            onChange={(e) => setFilters((f) => ({ ...f, relationship: e.target.value as PatientRelationship | "" }))}
            style={{ width: 160 }}
          >
            {RELATIONSHIP_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </FilterBar>

      <DataTable
        data={patients}
        columns={columns}
        rowKey={(p) => p.id}
        isFetching={isFetching}
        sort={{ field: sort.field, direction: sort.direction }}
        onSort={handleSort}
        emptyMessage="No patient profiles found."
      />

      <Pagination
        currentPage={pagination.page}
        pageSize={pagination.pageSize}
        totalRecords={totalCount}
        totalPages={data?.total_pages ?? 1}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
      />

      <PatientModal   patient={editPatient} isOpen={modalOpen} onClose={closeModal} />
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

    </div>
  );
}
