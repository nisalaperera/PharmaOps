"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Bell, SlidersHorizontal, CheckCheck, Check } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiPatch }       from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { formatDateTime }         from "@/lib/utils";
import { NOTIFICATION_TYPE_FILTER_OPTIONS, NOTIFICATION_READ_FILTER_OPTIONS, NOTIFICATION_TYPE_LABEL } from "@/lib/constants";
import { NOTIFICATION_TYPE_VARIANT } from "@/lib/badges";
import type { Notification, PaginatedResponse } from "@/types";

export default function NotificationsPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();

  // — Filter state
  const [typeFilter, setTypeFilter] = useState("");
  const [readFilter, setReadFilter] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialPageSize: 20, initialSortField: "created_at", initialSortDirection: "desc" });

  const filters = {
    ...(typeFilter && { type: typeFilter }),
    ...(readFilter && { is_read: readFilter }),
  };

  const hasActiveFilters  = typeFilter !== "" || readFilter !== "";
  const activeFilterCount = (typeFilter ? 1 : 0) + (readFilter ? 1 : 0);

  function clearFilters() {
    setTypeFilter(""); setReadFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  const { data, isLoading } = useQuery<PaginatedResponse<Notification>>({
    queryKey: ["notifications", queryParams, filters],
    queryFn:  () => apiGet<PaginatedResponse<Notification>>("/notifications", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
  });

  const items      = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  function invalidateNotifications() {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  }

  const markReadMutation = useMutation({
    mutationFn: (notification: Notification) =>
      apiPatch(`/notifications/${notification.id}/read`),
    onSuccess: invalidateNotifications,
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Could not mark the notification as read.");
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiPatch<{ updated: number }>("/notifications/mark-all-read"),
    onSuccess: (result) => {
      invalidateNotifications();
      showToast("success", "All Caught Up", `${result.updated} notification${result.updated !== 1 ? "s" : ""} marked as read.`);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Could not mark notifications as read.");
    },
  });

  function handleRowClick(row: Notification) {
    if (!row.is_read) markReadMutation.mutate(row);
    if (row.action_url) router.push(row.action_url);
  }

  const columns: Column<Notification>[] = [
    {
      key: "type",
      header: "Type",
      width: "150px",
      sortable: true,
      render: (row) => (
        <Badge variant={NOTIFICATION_TYPE_VARIANT[row.type]} dot={!row.is_read}>
          {NOTIFICATION_TYPE_LABEL[row.type]}
        </Badge>
      ),
    },
    {
      key: "title",
      header: "Notification",
      render: (row) => (
        <div>
          <p
            className={row.is_read ? "text-sm" : "text-sm font-semibold"}
            style={{ color: "var(--color-text)" }}
          >
            {row.title}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {row.message}
          </p>
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Received",
      width: "180px",
      sortable: true,
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "80px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          {!row.is_read && (
            <button
              title="Mark as read"
              onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(row); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Notifications</h1>
          </div>
          <p className="page-subtitle mt-1">Alerts about stock levels, transfers, approvals, and system events</p>
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
            placeholder="Search by title or message…"
            onSearch={handleSearch}
            className="w-[30rem] max-w-full"
          />

          <div
            className="flex items-center gap-2 pl-3 ml-1 border-l flex-shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Button
              variant="primary"
              leftIcon={<CheckCheck className="w-4 h-4" />}
              onClick={() => markAllReadMutation.mutate()}
              isLoading={markAllReadMutation.isPending}
            >
              Mark All as Read
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select
          value={readFilter}
          onChange={(e) => { setReadFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {NOTIFICATION_READ_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {NOTIFICATION_TYPE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      {/* ── Table card ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        <DataTable<Notification>
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          onRowClick={handleRowClick}
          emptyMessage={search ? `No notifications found matching "${search}"` : "You're all caught up — no notifications."}
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
              pageSizeOptions={[10, 20, 50]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
