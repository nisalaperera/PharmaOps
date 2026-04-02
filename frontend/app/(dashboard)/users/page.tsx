"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Plus, Pencil, KeyRound } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/hooks/useAuth";
import { usePagination } from "@/hooks/usePagination";
import { apiGet, apiPatch } from "@/lib/api-client";
import { formatDate, getRoleLabel, cn } from "@/lib/utils";
import { getRoleBadgeColor, USER_STATUS_VARIANT } from "@/lib/badges";
import { ROLE_OPTIONS } from "@/lib/constants";
import { UserModal } from "./UserModal";
import { PasswordResetModal } from "./PasswordResetModal";
import { GeneratedPasswordAlert } from "./GeneratedPasswordAlert";
import type { User, Branch, PaginatedResponse, UserStatus } from "@/types";
import toast from "react-hot-toast";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={USER_STATUS_VARIANT[status]}>{status}</Badge>;
}

// ─── Users page ───────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: me, permissions } = useAuth();
  const canManage = permissions?.isAdmin || permissions?.isManager || permissions?.isBranchAdmin;

  const [roleFilter,   setRoleFilter]   = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editingUser,  setEditingUser]  = useState<User | null>(null);
  const [resetUser,    setResetUser]    = useState<User | null>(null);
  const [genPw,        setGenPw]        = useState({ open: false, password: "", name: "" });

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialPageSize: 20, initialSortField: "full_name" });

  const filters = {
    ...(roleFilter   && { role: roleFilter }),
    ...(branchFilter && { branch_id: branchFilter }),
  };

  const { data, isLoading } = useQuery<PaginatedResponse<User>>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Status updated");
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Something went wrong");
    },
  });

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
      key:    "role",
      header: "Role",
      render: (row) => (
        <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full", getRoleBadgeColor(row.role))}>
          {getRoleLabel(row.role)}
        </span>
      ),
    },
    {
      key:    "branch_id",
      header: "Branch",
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
          {row.last_login_at ? formatDate(row.last_login_at) : "Never"}
        </span>
      ),
    },
    ...(canManage
      ? [{
          key:    "actions",
          header: "",
          width:  "120px",
          render: (row: User) => (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Pencil className="w-3.5 h-3.5" />}
                onClick={(e) => { e.stopPropagation(); setEditingUser(row); setModalOpen(true); }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<KeyRound className="w-3.5 h-3.5" />}
                onClick={(e) => { e.stopPropagation(); setResetUser(row); }}
                title="Reset password"
              />
              <button
                onClick={(e) => { e.stopPropagation(); toggleStatusMutation.mutate(row); }}
                disabled={row.id === me?.id}
                title={row.id === me?.id ? "Cannot deactivate yourself" : undefined}
                className={cn(
                  "text-xs px-2 py-1 rounded-md font-medium transition-colors",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  row.status === "ACTIVE"
                    ? "text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-900/20"
                    : "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                )}
              >
                {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </button>
            </div>
          ),
        } as Column<User>]
      : []),
  ];

  return (
    <div className="page-container">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle mt-1">Manage system users and their access levels</p>
        </div>
        {canManage && (
          <Button
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => { setEditingUser(null); setModalOpen(true); }}
          >
            New User
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
            placeholder="Search by name or email…"
            onSearch={handleSearch}
            className="w-full sm:w-72"
          />

          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); goToPage(1); }}
            className="text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-primary-500"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {permissions?.isOrgLevel && allBranches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); goToPage(1); }}
              className="text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-primary-500"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            >
              <option value="">All Branches</option>
              {allBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          {totalItems > 0 && (
            <span className="text-xs ml-auto hidden sm:block" style={{ color: "var(--color-text-muted)" }}>
              {totalItems} {totalItems === 1 ? "user" : "users"}
            </span>
          )}
        </div>

        {/* Table */}
        <DataTable<User>
          columns={columns}
          data={users}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No users found matching "${search}"` : "No users found."}
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

      <UserModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingUser(null); }}
        editingUser={editingUser}
        onCreated={(password, name) => setGenPw({ open: true, password, name })}
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
    </div>
  );
}
