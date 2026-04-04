"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Users, Plus, Pencil, KeyRound, Upload, SlidersHorizontal,
  Eye, Trash2, FileDown, FileText,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { StatusBadge }            from "@/components/ui/StatusBadge";
import { ConfirmModal }           from "@/components/ui/ConfirmModal";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch, apiDownloadFile, apiUploadFile, downloadBlob } from "@/lib/api-client";
import { ImportModal }            from "@/components/common/ImportModal";
import { formatDateTime, getRoleLabel, cn } from "@/lib/utils";
import { getRoleBadgeColor }      from "@/lib/badges";
import { ROLE_OPTIONS, USER_STATUS_FILTER_OPTIONS } from "@/lib/constants";
import { UserModal }              from "@/app/(pages)/users/components/UserModal";
import { UserViewModal }          from "@/app/(pages)/users/components/UserViewModal";
import { PasswordResetModal }     from "@/app/(pages)/users/components/PasswordResetModal";
import { GeneratedPasswordAlert } from "@/app/(pages)/users/components/GeneratedPasswordAlert";
import type { User, Branch, PaginatedResponse, UserStatus, ImportResult } from "@/types";
import { showToast } from "@/lib/toast";

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function buildUserCsvRow(user: User, branchNameMap: Record<string, string>): string[] {
  return [
    user.full_name,
    user.email,
    getRoleLabel(user.role),
    user.branch_id ? (branchNameMap[user.branch_id] ?? user.branch_id) : "—",
    user.status,
    user.last_login_at ? formatDateTime(user.last_login_at) : "Never",
  ];
}

function exportSelectedCsv(selectedUsers: User[], branchNameMap: Record<string, string>) {
  const header  = ["Full Name", "Email", "Role", "Branch", "Status", "Last Login"];
  const rows    = selectedUsers.map((u) => buildUserCsvRow(u, branchNameMap));
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, "users_selected.csv");
}

function exportSelectedPdf(selectedUsers: User[], branchNameMap: Record<string, string>) {
  const doc  = new jsPDF();
  const head = [["Full Name", "Email", "Role", "Branch", "Status", "Last Login"]];
  const body = selectedUsers.map((u) => buildUserCsvRow(u, branchNameMap));
  doc.setFontSize(14);
  doc.text("User Management — Selected Records", 14, 16);
  autoTable(doc, { head, body, startY: 22, styles: { fontSize: 8 } });
  doc.save("users_selected.pdf");
}

// ─── Users page ───────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: me, permissions } = useAuth();
  const canManage = permissions?.isAdmin || permissions?.isManager || permissions?.isBranchAdmin;

  const [roleFilter,    setRoleFilter]    = useState("");
  const [branchFilter,  setBranchFilter]  = useState("");
  const [statusFilter,  setStatusFilter]  = useState<UserStatus | "">("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingUser,   setEditingUser]   = useState<User | null>(null);
  const [viewUser,      setViewUser]      = useState<User | null>(null);
  const [resetUser,     setResetUser]     = useState<User | null>(null);
  const [confirmUser,   setConfirmUser]   = useState<User | null>(null);
  const [genPw,         setGenPw]         = useState({ open: false, password: "", name: "" });
  const [importOpen,    setImportOpen]    = useState(false);

  // ─── Row selection ──────────────────────────────────────────────────────────
  const [selectedKeys,      setSelectedKeys]      = useState<Set<string>>(new Set());
  const [allPagesSelected,  setAllPagesSelected]  = useState(false);
  const [isExportingCsv,    setIsExportingCsv]    = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialPageSize: 20, initialSortField: "full_name" });

  const filters = {
    ...(roleFilter   && { role: roleFilter }),
    ...(branchFilter && { branch_id: branchFilter }),
    ...(statusFilter && { status: statusFilter }),
  };

  const hasActiveFilters  = roleFilter !== "" || branchFilter !== "" || statusFilter !== "";
  const activeFilterCount = (roleFilter ? 1 : 0) + (branchFilter ? 1 : 0) + (statusFilter ? 1 : 0);

  function clearFilters() {
    setRoleFilter("");
    setBranchFilter("");
    setStatusFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<User>>({
    queryKey: ["users", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<User>>("/users", { ...queryParams, ...filters }),
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

  const users      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const queryClient = useQueryClient();

  const toggleStatusMutation = useMutation({
    mutationFn: (user: User) =>
      apiPatch<User>(`/users/${user.id}`, {
        status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      }),
    onSuccess: (_, user) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      const wasActive = user.status === "ACTIVE";
      showToast(
        "success",
        wasActive ? "User Deactivated" : "User Activated",
        wasActive
          ? `${user.full_name} can no longer sign in.`
          : `${user.full_name} can now sign in to the system.`
      );
      setConfirmUser(null);
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

  const currentPageKeys    = users.map((u) => u.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() {
    setAllPagesSelected(true);
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setAllPagesSelected(false);
  }

  const selectedUsers = users.filter((u) => selectedKeys.has(u.id));

  // ─── Export ─────────────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (roleFilter)   exportParams.role      = roleFilter;
        if (branchFilter) exportParams.branch_id = branchFilter;
        if (statusFilter) exportParams.status    = statusFilter;
        if (search)       exportParams.search    = search;
        const blob = await apiDownloadFile("/users/export", exportParams);
        downloadBlob(blob, "users_export.csv");
      } catch {
        showToast("error", "Export Failed", "Could not export users. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedUsers, branchNameMap);
    }
  }

  function handleExportPdf() {
    exportSelectedPdf(selectedUsers, branchNameMap);
  }

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/users/import", file);
    queryClient.invalidateQueries({ queryKey: ["users"] });
    return result;
  }

  async function handleDownloadUserTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/users/import/template");
    downloadBlob(blob, "users_import_template.csv");
  }

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns: Column<User>[] = [
    {
      key:      "full_name",
      header:   "User",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.full_name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {row.email}
          </p>
        </div>
      ),
    },
    {
      key:      "role",
      header:   "Role",
      sortable: true,
      render: (row) => (
        <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full", getRoleBadgeColor(row.role))}>
          {getRoleLabel(row.role)}
        </span>
      ),
    },
    {
      key:      "branch_id",
      header:   "Branch",
      sortable: true,
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.branch_id ? (branchNameMap[row.branch_id] ?? row.branch_id) : "—"}
        </span>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key:    "last_login_at",
      header: "Last Login",
      render: (row) => (
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {row.last_login_at ? formatDateTime(row.last_login_at) : "Never"}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "140px",
      render: (row: User) => (
        <div className="flex items-center gap-0.5">
          {/* Extra actions (separated) */}
          {canManage && (
            <>
              <button
                title="Reset Password"
                onClick={(e) => { e.stopPropagation(); setResetUser(row); }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
              <span
                className="w-px h-4 mx-1 flex-shrink-0"
                style={{ background: "var(--color-border)" }}
              />
            </>
          )}

          {/* Basic actions */}
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewUser(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <button
              title="Edit User"
              onClick={(e) => { e.stopPropagation(); setEditingUser(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {canManage && (
            <button
              title={row.status === "ACTIVE" ? "Deactivate User" : "Activate User"}
              onClick={(e) => { e.stopPropagation(); setConfirmUser(row); }}
              disabled={row.id === me?.id}
              className={cn(
                "p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                row.status === "ACTIVE"
                  ? "text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const isDeactivating = confirmUser?.status === "ACTIVE";
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  return (
    <div className="page-container">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">User Management</h1>
          </div>
          <p className="page-subtitle mt-1">Manage system users and their access levels</p>
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
            placeholder="Search by name or email…"
            onSearch={handleSearch}
            className="w-[30rem] max-w-full"
          />
          {/* Separator + action buttons */}
          {canManage && (
            <div
              className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Button
                variant="primary"
                leftIcon={<Upload className="w-4 h-4" />}
                onClick={() => setImportOpen(true)}
              >
                Import
              </Button>
              <Button
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => { setEditingUser(null); setModalOpen(true); }}
              >
                New User
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar
        isVisible={filterVisible}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onHide={hideFilters}
      >
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          <option value="">All Roles</option>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ""); goToPage(1); }}
          className="form-select w-auto"
        >
          {USER_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

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
      </FilterBar>

      {/* Table card */}
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

        <DataTable<User>
          columns={columns}
          data={users}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No users found matching "${search}"` : "No users found."}
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
              pageSizeOptions={[10, 20, 50]}
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

      {/* Modals */}
      <UserModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingUser(null); }}
        editingUser={editingUser}
        onCreated={(password, name) => setGenPw({ open: true, password, name })}
      />

      <UserViewModal
        isOpen={!!viewUser}
        onClose={() => setViewUser(null)}
        user={viewUser}
      />

      <GeneratedPasswordAlert
        isOpen={genPw.open}
        onClose={() => setGenPw({ open: false, password: "", name: "" })}
        password={genPw.password}
        userName={genPw.name}
      />

      <PasswordResetModal
        isOpen={!!resetUser}
        onClose={() => setResetUser(null)}
        user={resetUser}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Users"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadUserTemplate}
        templateNote="Required columns: full_name, email, role. Optional: phone, branch_name (required for branch roles), password (auto-generated if blank), status."
      />

      <ConfirmModal
        isOpen={!!confirmUser}
        onClose={() => setConfirmUser(null)}
        title={isDeactivating ? "Deactivate User" : "Activate User"}
        body={
          isDeactivating ? (
            <>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmUser?.full_name}
              </span>
              ? They will no longer be able to sign in.
            </>
          ) : (
            <>
              Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {confirmUser?.full_name}
              </span>
              ?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmUser && toggleStatusMutation.mutate(confirmUser)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
