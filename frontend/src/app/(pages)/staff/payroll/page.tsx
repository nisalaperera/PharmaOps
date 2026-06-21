"use client";

import { useState, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Wallet, Plus, Eye, SlidersHorizontal,
  CheckCircle2, FileDown, FileText,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }             from "@/components/common/Pagination";
import { SearchBar }              from "@/components/common/SearchBar";
import { FilterBar }              from "@/components/common/FilterBar";
import { Button }                 from "@/components/ui/Button";
import { Badge }                  from "@/components/ui/Badge";
import { useAuth }                from "@/hooks/useAuth";
import { useBranch }              from "@/hooks/useBranch";
import { usePagination }          from "@/hooks/usePagination";
import { apiGet, apiDownloadFile, downloadBlob } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { formatAmount }           from "@/lib/utils";
import {
  MONTH_OPTIONS, MONTH_FILTER_OPTIONS,
  PAYROLL_PAID_FILTER_OPTIONS,
  DEDUCTION_TYPE_OPTIONS,
} from "@/lib/constants";
import APP_CONFIG from "@/lib/config";
import { PayrollModal }     from "@/app/(pages)/staff/payroll/components/PayrollModal";
import { PayrollViewModal } from "@/app/(pages)/staff/payroll/components/PayrollViewModal";
import { PayrollPayModal }  from "@/app/(pages)/staff/payroll/components/PayrollPayModal";
import type { Payroll, Branch, PaginatedResponse } from "@/types";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MONTH_NAMES = MONTH_OPTIONS.map((m) => m.label);

function periodLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const CSV_HEADERS = [
  "Staff Member", "Month", "Year",
  "Basic Salary", "Overtime Pay", "Gross Salary",
  "Deductions", "Net Salary", "Status",
];

function buildPayrollRow(record: Payroll): string[] {
  return [
    record.staff_name,
    MONTH_NAMES[record.month - 1] ?? String(record.month),
    String(record.year),
    record.basic_salary.toFixed(2),
    record.overtime_pay.toFixed(2),
    record.gross_salary.toFixed(2),
    record.total_deductions.toFixed(2),
    record.net_salary.toFixed(2),
    record.is_paid ? "Paid" : "Unpaid",
  ];
}

function exportSelectedCsv(selected: Payroll[], branchName?: string) {
  const rows    = selected.map(buildPayrollRow);
  const csvText = [CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob      = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const branchSlug = branchName ? `_${branchName.toLowerCase().replace(/\s+/g, "_")}` : "";
  downloadBlob(blob, `payroll${branchSlug}_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: Payroll[], branchName?: string) {
  const doc  = new jsPDF();
  const head = [CSV_HEADERS];
  const body = selected.map(buildPayrollRow);

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
    // Non-fatal â€” continue without logo.
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
  doc.text("Payroll Report â€” " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 7 } });

  const branchSlug = branchName ? `_${branchName.toLowerCase().replace(/\s+/g, "_")}` : "";
  doc.save(`payroll${branchSlug}_${exportDateStamp()}.pdf`);
}

// â”€â”€â”€ Payroll page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function PayrollPage() {
  const { permissions } = useAuth();
  const { activeBranchId } = useBranch();
  const canManage = (permissions?.isAdmin || permissions?.isManager || permissions?.isBranchAdmin) ?? false;

  // â€” Filters
  const [monthFilter,   setMonthFilter]   = useState("");
  const [yearFilter,    setYearFilter]    = useState("");
  const [paidFilter,    setPaidFilter]    = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

  // â€” Modals
  const [modalOpen,     setModalOpen]     = useState(false);
  const [viewPayroll,   setViewPayroll]   = useState<Payroll | null>(null);
  const [confirmPay,    setConfirmPay]    = useState<Payroll | null>(null);

  // â€” Selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "created_at", initialSortDirection: "desc" });

  const filters = {
    ...(activeBranchId && { branch_id: activeBranchId }),
    ...(monthFilter    && { month:     monthFilter  }),
    ...(yearFilter     && { year:      yearFilter   }),
    ...(paidFilter     && { is_paid:   paidFilter   }),
  };

  const hasActiveFilters  = monthFilter !== "" || yearFilter !== "" || paidFilter !== "";
  const activeFilterCount = (monthFilter ? 1 : 0) + (yearFilter ? 1 : 0) + (paidFilter ? 1 : 0);

  function clearFilters() {
    setMonthFilter(""); setYearFilter(""); setPaidFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // â”€â”€â”€ Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Payroll>>({
    queryKey:        ["payroll", queryParams, filters],
    queryFn:         () => apiGet<PaginatedResponse<Payroll>>("/staff/payroll", { ...queryParams, ...filters }),
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

  const currentBranchName = activeBranchId ? (branchNameMap[activeBranchId] ?? undefined) : undefined;

  // â”€â”€â”€ Mark as paid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // â”€â”€â”€ Selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (activeBranchId) exportParams.branch_id = activeBranchId;
        if (monthFilter)  exportParams.month      = monthFilter;
        if (yearFilter)   exportParams.year       = yearFilter;
        if (paidFilter)   exportParams.is_paid    = paidFilter;
        if (search)       exportParams.search     = search;
        const blob = await apiDownloadFile("/staff/payroll/export", exportParams);
        const branchSlug = currentBranchName ? `_${currentBranchName.toLowerCase().replace(/\s+/g, "_")}` : "";
        downloadBlob(blob, `payroll${branchSlug}_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export payroll records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems, currentBranchName);
    }
  }

  function handleExportPdf() {
    exportSelectedPdf(selectedItems, currentBranchName);
  }

  // â”€â”€â”€ Year options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2019 }, (_, i) => 2020 + i);

  // â”€â”€â”€ Columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const deductionLabel = (type: string) =>
    DEDUCTION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

  const columns: Column<Payroll>[] = [
    {
      key:      "staff_name",
      header:   "Staff Member",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {row.staff_name}
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
      key:    "month",
      header: "Period",
      render: (row) => (
        <span className="text-sm font-mono" style={{ color: "var(--color-text)" }}>
          {periodLabel(row.month, row.year)}
        </span>
      ),
    },
    {
      key:      "gross_salary",
      header:   "Gross",
      sortable: true,
      render:   (row) => (
        <div>
          <p className="text-sm tabular-nums" style={{ color: "var(--color-text)" }}>
            {formatAmount(row.gross_salary)}
          </p>
          {row.deductions.length > 0 && (
            <p className="text-xs tabular-nums text-danger-500 mt-0.5">
              âˆ’ {formatAmount(row.total_deductions)}&thinsp;
              <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>
                ({row.deductions.map((d) => deductionLabel(d.type)).join(", ")})
              </span>
            </p>
          )}
        </div>
      ),
    },
    {
      key:      "net_salary",
      header:   "Net Salary",
      sortable: true,
      render:   (row) => (
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
          {formatAmount(row.net_salary)}
        </span>
      ),
    },
    {
      key:    "is_paid",
      header: "Status",
      render: (row) => (
        <Badge variant={row.is_paid ? "success" : "warning"}>
          {row.is_paid ? "Paid" : "Unpaid"}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "90px",
      render: (row) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewPayroll(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && !row.is_paid && (
            <button
              title="Mark as Paid"
              onClick={(e) => { e.stopPropagation(); setConfirmPay(row); }}
              className="p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">

      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Payroll</h1>
          </div>
          <p className="page-subtitle mt-1">Generate and manage staff salary payments</p>
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
            placeholder="Search by staff nameâ€¦"
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
                onClick={() => setModalOpen(true)}
              >
                Generate Payroll
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ Filter bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
        <select
          value={monthFilter}
          onChange={(e) => { setMonthFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {MONTH_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={yearFilter}
          onChange={(e) => { setYearFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          <option value="">All Years</option>
          {yearOptions.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>

        <select
          value={paidFilter}
          onChange={(e) => { setPaidFilter(e.target.value); goToPage(1); }}
          className="form-select w-auto"
        >
          {PAYROLL_PAID_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      {/* â”€â”€ Table card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

        <DataTable<Payroll>
          columns={columns}
          data={items}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No payroll records found matching "${search}"` : "No payroll records found."}
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

      {/* â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <PayrollModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      <PayrollViewModal
        isOpen={!!viewPayroll}
        onClose={() => setViewPayroll(null)}
        payroll={viewPayroll}
        branchNameMap={branchNameMap}
      />

      <PayrollPayModal
        payroll={confirmPay}
        onClose={() => setConfirmPay(null)}
      />
    </div>
  );
}
