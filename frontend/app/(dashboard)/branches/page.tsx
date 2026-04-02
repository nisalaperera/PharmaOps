"use client";

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/hooks/useAuth";
import { usePagination } from "@/hooks/usePagination";
import { apiGet } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { getActiveStatusVariant } from "@/lib/badges";
import { ACTIVE_STATUS_OPTIONS } from "@/lib/constants";
import { BranchModal } from "./BranchModal";
import type { Branch, PaginatedResponse } from "@/types";

export default function BranchesPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.isAdmin || permissions?.isManager;

  const [statusFilter,  setStatusFilter]  = useState("");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialPageSize: 20, initialSortField: "name" });

  const filters = { ...(statusFilter && { is_active: statusFilter }) };

  const { data, isLoading } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const branches   = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const columns: Column<Branch>[] = [
    {
      key:      "name",
      header:   "Branch",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.name}
          </p>
          <p className="text-xs mt-0.5 truncate max-w-[260px]" style={{ color: "var(--color-text-muted)" }}>
            {row.address}
          </p>
        </div>
      ),
    },
    {
      key:    "phone",
      header: "Phone",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>{row.phone}</span>
      ),
    },
    {
      key:    "license_number",
      header: "License No.",
      render: (row) => (
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
        >
          {row.license_number}
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
      key:      "created_at",
      header:   "Created",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
    ...(canManage
      ? [{
          key:    "actions",
          header: "",
          width:  "80px",
          render: (row: Branch) => (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Pencil className="w-3.5 h-3.5" />}
              onClick={(e) => { e.stopPropagation(); setEditingBranch(row); setModalOpen(true); }}
            >
              Edit
            </Button>
          ),
        } as Column<Branch>]
      : []),
  ];

  return (
    <div className="page-container">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="page-subtitle mt-1">Manage all pharmacy branches across the organisation</p>
        </div>
        {canManage && (
          <Button
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => { setEditingBranch(null); setModalOpen(true); }}
          >
            New Branch
          </Button>
        )}
      </div>

      {/* Table card */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        {/* Toolbar */}
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <SearchBar
            placeholder="Search by name or address…"
            onSearch={handleSearch}
            className="w-full sm:w-72"
          />

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); }}
            className="text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-primary-500"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            {ACTIVE_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {totalItems > 0 && (
            <span className="text-xs ml-auto hidden sm:block" style={{ color: "var(--color-text-muted)" }}>
              {totalItems} {totalItems === 1 ? "branch" : "branches"}
            </span>
          )}
        </div>

        {/* Table */}
        <DataTable<Branch>
          columns={columns}
          data={branches}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No branches found matching "${search}"` : "No branches found."}
        />

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
            <Pagination
              currentPage={pagination.page}
              totalPages={totalPages}
              totalRecords={totalItems}
              pageSize={pagination.pageSize}
              onPageChange={goToPage}
              onPageSizeChange={changePageSize}
              pageSizeOptions={[10, 20, 50]}
            />
          </div>
        )}
      </div>

      <BranchModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingBranch(null); }}
        editingBranch={editingBranch}
      />
    </div>
  );
}
