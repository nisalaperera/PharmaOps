"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  CalendarCheck, Plus, Pencil,
  Eye, FileDown, FileText, Clock,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  format, subDays, subMonths,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
} from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { Button }                 from "@/components/ui/Button";
import { useAuth }                from "@/hooks/useAuth";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { cn, formatTime }           from "@/lib/utils";
import { showToast }              from "@/lib/toast";
import APP_CONFIG from "@/lib/config";
import { AttendanceModal }     from "@/app/(pages)/staff/attendance/components/AttendanceModal";
import { AttendanceViewModal } from "@/app/(pages)/staff/attendance/components/AttendanceViewModal";
import type { Attendance, Staff, Branch, PaginatedResponse } from "@/types";

// ─── Quick date range tags ────────────────────────────────────────────────────

type DateRangeTagId = "today" | "thisMonth" | "last7" | "last30" | "lastWeek" | "lastMonth" | "last3months";

interface DateRangeTag {
  id:    DateRangeTagId;
  label: string;
  from:  () => Date;
  to:    () => Date;
}

const DATE_RANGE_TAGS: DateRangeTag[] = [
  {
    id:    "today",
    label: "Today",
    from:  () => new Date(),
    to:    () => new Date(),
  },
  {
    id:    "thisMonth",
    label: "This Month",
    from:  () => startOfMonth(new Date()),
    to:    () => new Date(),
  },
  {
    id:    "last7",
    label: "Last 7 Days",
    from:  () => subDays(new Date(), 6),
    to:    () => new Date(),
  },
  {
    id:    "last30",
    label: "Last 30 Days",
    from:  () => subDays(new Date(), 29),
    to:    () => new Date(),
  },
  {
    id:    "lastWeek",
    label: "Last Week",
    from:  () => startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }),
    to:    () => endOfWeek(subDays(new Date(), 7),   { weekStartsOn: 1 }),
  },
  {
    id:    "lastMonth",
    label: "Last Month",
    from:  () => startOfMonth(subMonths(new Date(), 1)),
    to:    () => endOfMonth(subMonths(new Date(), 1)),
  },
  {
    id:    "last3months",
    label: "Last 3 Months",
    from:  () => startOfMonth(subMonths(new Date(), 3)),
    to:    () => endOfMonth(subMonths(new Date(), 1)),
  },
];

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

// ─── Duration helpers ─────────────────────────────────────────────────────────

/** Raw minutes between two "HH:MM" strings; returns 0 when invalid or negative. */
function calcMinutes(clockIn: string | null | undefined, clockOut: string | null | undefined): number {
  if (!clockIn || !clockOut) return 0;
  const [inH,  inM]  = clockIn.split(":").map(Number);
  const [outH, outM] = clockOut.split(":").map(Number);
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return 0;
  const diff = (outH * 60 + outM) - (inH * 60 + inM);
  return diff > 0 ? diff : 0;
}

/** Compute "Xh Ym" from two "HH:MM" strings. Returns "—" when either is absent or difference ≤ 0. */
function calcDuration(clockIn: string | null | undefined, clockOut: string | null | undefined): string {
  const totalMinutes = calcMinutes(clockIn, clockOut);
  if (totalMinutes === 0) return "—";
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0)                 return `${hours}h`;
  return `${minutes}m`;
}

/** Format a total minutes count into "Xh Ym". */
function formatTotalDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0m";
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0)                 return `${hours}h`;
  return `${minutes}m`;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function buildAttendanceRow(record: Attendance): string[] {
  return [
    record.staff_name,
    record.date,
    record.clock_in  ? formatTime(record.clock_in)  : "",
    record.clock_out ? formatTime(record.clock_out) : "",
    calcDuration(record.clock_in, record.clock_out),
    record.notes ?? "",
  ];
}

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const CSV_HEADERS = ["Staff Name", "Date", "Clock In", "Clock Out", "Duration", "Notes"];

function exportSelectedCsv(selected: Attendance[]) {
  const rows    = selected.map(buildAttendanceRow);
  const csvText = [CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `attendance_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: Attendance[], branchName?: string) {
  const doc  = new jsPDF({ orientation: "landscape" });
  const head = [CSV_HEADERS];
  const body = selected.map(buildAttendanceRow);

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
    // Non-fatal — continue without logo.
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
  doc.text("Attendance Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 7 } });

  const branchSlug = branchName ? `_${branchName.toLowerCase().replace(/\s+/g, "_")}` : "";
  doc.save(`attendance${branchSlug}_${exportDateStamp()}.pdf`);
}

// ─── Attendance page ──────────────────────────────────────────────────────────

const DEFAULT_TAG: DateRangeTagId = "last7";

export default function AttendancePage() {
  const { user: me, permissions } = useAuth();
  const canManage = permissions?.isAdmin || permissions?.isManager || permissions?.isBranchAdmin;

  // — Filters
  const [branchFilter,   setBranchFilter]   = useState("");
  const [staffFilter,    setStaffFilter]    = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter,   setDateToFilter]   = useState("");
  const [activeTag,      setActiveTag]      = useState<DateRangeTagId | null>(null);

  // — Modals
  const [modalOpen,         setModalOpen]         = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null);
  const [viewRecord,        setViewRecord]        = useState<Attendance | null>(null);

  // — Selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "date", initialSortDirection: "desc" });

  // Apply default tag on mount
  useEffect(() => {
    const tag = DATE_RANGE_TAGS.find((t) => t.id === DEFAULT_TAG)!;
    setDateFromFilter(toDateStr(tag.from()));
    setDateToFilter(toDateStr(tag.to()));
    setActiveTag(DEFAULT_TAG);
  }, []);

  function applyTag(tag: DateRangeTag) {
    setDateFromFilter(toDateStr(tag.from()));
    setDateToFilter(toDateStr(tag.to()));
    setActiveTag(tag.id);
    goToPage(1);
  }

  function handleDateFromChange(value: string) {
    setDateFromFilter(value);
    setActiveTag(null);
    goToPage(1);
  }

  function handleDateToChange(value: string) {
    setDateToFilter(value);
    setActiveTag(null);
    goToPage(1);
  }

  const filters = {
    ...(branchFilter   && { branch_id: branchFilter }),
    ...(staffFilter    && { staff_id:  staffFilter }),
    ...(dateFromFilter && { date_from: dateFromFilter }),
    ...(dateToFilter   && { date_to:   dateToFilter }),
  };

  // ─── Data ─────────────────────────────────────────────────────────────────────

  // All four filters are mandatory before loading data
  const branchReady    = !permissions?.isOrgLevel || !!branchFilter;
  const attendanceEnabled = branchReady && !!staffFilter && !!dateFromFilter && !!dateToFilter;

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Attendance>>({
    queryKey:        ["attendance", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<Attendance>>("/staff/attendance", { ...queryParams, ...filters }),
    placeholderData: keepPreviousData,
    enabled:         attendanceEnabled,
  });

  const { data: totalsData } = useQuery<{ total_minutes: number }>({
    queryKey:  ["attendance-totals", filters],
    queryFn:   () => apiGet<{ total_minutes: number }>("/staff/attendance/totals", filters),
    staleTime: 30 * 1000,
    enabled:   attendanceEnabled,
  });

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    enabled:   permissions?.isOrgLevel ?? false,
    staleTime: 5 * 60 * 1000,
  });
  const allBranches   = branchesData?.data ?? [];
  const branchNameMap = Object.fromEntries(allBranches.map((b) => [b.id, b.name]));

  // Staff list filtered by branch — uses the dedicated by-branch endpoint (unpaginated)
  const staffQueryBranchId = permissions?.isOrgLevel ? branchFilter : (me?.branchId ?? "");
  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey:  ["staff-by-branch", staffQueryBranchId],
    queryFn:   () => apiGet<Staff[]>(`/staff/by-branch/${staffQueryBranchId}`),
    staleTime: 2 * 60 * 1000,
    enabled:   !!staffQueryBranchId,
  });

  const items      = attendanceEnabled ? (data?.data        ?? []) : [];
  const totalItems = attendanceEnabled ? (data?.total       ?? 0)  : 0;
  const totalPages = attendanceEnabled ? (data?.total_pages ?? 1)  : 1;

  const filteredTotalMinutes  = totalsData?.total_minutes ?? 0;

  const currentBranchName = branchFilter ? (branchNameMap[branchFilter] ?? undefined) : undefined;

  // ─── Selection ────────────────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = items.map((r) => r.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = items.filter((r) => selectedKeys.has(r.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  const selectedTotalMinutes = allPagesSelected
    ? filteredTotalMinutes
    : selectedItems.reduce((acc, row) => acc + calcMinutes(row.clock_in, row.clock_out), 0);

  // ─── Export ────────────────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (branchFilter)   exportParams.branch_id = branchFilter;
        if (staffFilter)    exportParams.staff_id  = staffFilter;
        if (dateFromFilter) exportParams.date_from = dateFromFilter;
        if (dateToFilter)   exportParams.date_to   = dateToFilter;
        if (search)         exportParams.search    = search;
        const blob = await apiDownloadFile("/staff/attendance/export", exportParams);
        const branchSlug = currentBranchName ? `_${currentBranchName.toLowerCase().replace(/\s+/g, "_")}` : "";
        downloadBlob(blob, `attendance${branchSlug}_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export attendance records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems);
    }
  }

  function handleExportPdf() {
    exportSelectedPdf(selectedItems, currentBranchName);
  }

  // ─── Columns ──────────────────────────────────────────────────────────────────

  const columns: Column<Attendance>[] = [
    {
      key:      "date",
      header:   "Date",
      sortable: true,
      render:   (row) => (
        <span className="text-sm" style={{ color: "var(--color-text)" }}>{row.date}</span>
      ),
    },
    {
      key:    "clock_in",
      header: "Clock In",
      render: (row) => (
        <span className="text-sm" style={{ color: row.clock_in ? "var(--color-text)" : "var(--color-text-muted)" }}>
          {row.clock_in ? formatTime(row.clock_in) : "—"}
        </span>
      ),
    },
    {
      key:    "clock_out",
      header: "Clock Out",
      render: (row) => (
        <span className="text-sm" style={{ color: row.clock_out ? "var(--color-text)" : "var(--color-text-muted)" }}>
          {row.clock_out ? formatTime(row.clock_out) : "—"}
        </span>
      ),
    },
    {
      key:    "duration",
      header: "Duration",
      render: (row) => {
        const duration = calcDuration(row.clock_in, row.clock_out);
        return (
          <span className="text-sm" style={{ color: duration === "—" ? "var(--color-text-muted)" : "var(--color-text)" }}>
            {duration}
          </span>
        );
      },
    },
    {
      key:    "notes",
      header: "Notes",
      render: (row) => (
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {row.notes || "—"}
        </span>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "80px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewRecord(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <button
              title="Edit"
              onClick={(e) => { e.stopPropagation(); setEditingAttendance(row); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Attendance</h1>
          </div>
          <p className="page-subtitle mt-1">Track daily staff clock-in and clock-out records</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SearchBar
            placeholder="Search by staff name…"
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
                onClick={() => { setEditingAttendance(null); setModalOpen(true); }}
              >
                Record Attendance
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filters (always visible) ───────────────────────────────────────── */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Filter controls — order: Branch, Staff Member, From, To */}
        <div className="flex flex-wrap items-end gap-3">

          {/* Branch — org-level only */}
          {permissions?.isOrgLevel && allBranches.length > 0 && (
            <div>
              <label className="form-label text-xs mb-1">
                Branch <span className="text-danger-500">*</span>
              </label>
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setStaffFilter("");
                  goToPage(1);
                }}
                className="form-select w-auto"
              >
                <option value="">Select Branch…</option>
                {allBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Staff Member */}
          <div>
            <label className="form-label text-xs mb-1">
              Staff Member <span className="text-danger-500">*</span>
            </label>
            <select
              value={staffFilter}
              onChange={(e) => { setStaffFilter(e.target.value); goToPage(1); }}
              className={cn(
                "form-select w-auto",
                permissions?.isOrgLevel && !staffQueryBranchId && "opacity-50 cursor-not-allowed"
              )}
              disabled={permissions?.isOrgLevel && !staffQueryBranchId}
            >
              <option value="">
                {permissions?.isOrgLevel && !staffQueryBranchId
                  ? "Select a branch first…"
                  : "Select Staff Member…"}
              </option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {[s.title, s.first_name, s.last_name].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </div>

          {/* From */}
          <div>
            <label className="form-label text-xs mb-1">
              From <span className="text-danger-500">*</span>
            </label>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="form-input w-auto"
            />
          </div>

          {/* To */}
          <div>
            <label className="form-label text-xs mb-1">
              To <span className="text-danger-500">*</span>
            </label>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="form-input w-auto"
            />
          </div>

          {/* Clear optional selections */}
          {(branchFilter || staffFilter) && (
            <button
              type="button"
              onClick={() => { setBranchFilter(""); setStaffFilter(""); goToPage(1); }}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--color-text-muted)", background: "var(--color-surface-2)" }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick date tags — below filter controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-medium shrink-0" style={{ color: "var(--color-text-muted)" }}>
            Quick range:
          </span>
          {DATE_RANGE_TAGS.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => applyTag(tag)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                activeTag === tag.id
                  ? "bg-primary-500 text-white border-primary-500"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-primary-400 hover:text-primary-500"
              )}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

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

        <DataTable<Attendance>
          columns={columns}
          data={items}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={
            !attendanceEnabled
              ? "Select Branch, Staff Member, From and To to view attendance records."
              : search
              ? `No attendance records found matching "${search}"`
              : "No attendance records found for the selected filters."
          }
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelectionChange}
        />

        {attendanceEnabled && totalItems > 0 && (
          <div
            className="border-t px-4 py-2 flex items-center gap-2"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
          >
            <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Total hours:</span>
            <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
              {formatTotalDuration(filteredTotalMinutes)}
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              across {totalItems} record{totalItems !== 1 ? "s" : ""}
            </span>
          </div>
        )}

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
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {selectionCount} record{selectionCount !== 1 ? "s" : ""} selected
              </p>
              {selectedTotalMinutes > 0 && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                    {formatTotalDuration(selectedTotalMinutes)}
                  </span>
                </div>
              )}
            </div>
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
      <AttendanceModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingAttendance(null); }}
        editingAttendance={editingAttendance}
      />

      <AttendanceViewModal
        isOpen={!!viewRecord}
        onClose={() => setViewRecord(null)}
        record={viewRecord}
      />
    </div>
  );
}
