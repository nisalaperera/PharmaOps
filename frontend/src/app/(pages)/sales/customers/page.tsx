"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Contact, Plus, Pencil, Upload, SlidersHorizontal, Eye, UserX, UserCheck, FileDown, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
import { formatPhoneNumber }      from "@/lib/utils";
import { getActiveStatusVariant } from "@/lib/badges";
import { ACTIVE_STATUS_OPTIONS }  from "@/lib/constants";
import APP_CONFIG                 from "@/lib/config";
import { CustomerModal }          from "@/app/(pages)/sales/customers/components/CustomerModal";
import { CustomerViewModal }      from "@/app/(pages)/sales/customers/components/CustomerViewModal";
import type { Customer, PaginatedResponse, ImportResult } from "@/types";

// â”€â”€ Export helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildRow(customer: Customer): string[] {
  return [
    customer.full_name,
    customer.phone,
    customer.email ?? "",
    customer.date_of_birth ?? "",
    customer.address ?? "",
    customer.credit_limit.toFixed(2),
    customer.outstanding_balance.toFixed(2),
    customer.is_active ? "Active" : "Inactive",
  ];
}

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function exportSelectedCsv(selected: Customer[]) {
  const header  = ["Full Name", "Phone", "Email", "Date of Birth", "Address", "Credit Limit", "Outstanding Balance", "Status"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `customers_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: Customer[]) {
  const doc  = new jsPDF();
  const head = [["Full Name", "Phone", "Email", "Credit Limit", "Outstanding", "Status"]];
  const body = selected.map((c) => [
    c.full_name,
    c.phone,
    c.email ?? "",
    c.credit_limit.toFixed(2),
    c.outstanding_balance.toFixed(2),
    c.is_active ? "Active" : "Inactive",
  ]);

  let cursorY = 14;
  try {
    const res     = await fetch(APP_CONFIG.orgLogo);
    const blob    = await res.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader  = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, "PNG", 14, cursorY, 12, 12);
    cursorY += 1;
  } catch {
    // Logo load failure is non-fatal â€” continue without it.
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
  cursorY += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Customer Report â€” ${exportDateStamp()}`, 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });
  doc.save(`customers_${exportDateStamp()}.pdf`);
}

// â”€â”€ Page component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CustomersPage() {
  const { permissions } = useAuth();
  const canManage = permissions?.isAdmin || permissions?.isManager || permissions?.can("BRANCH_MANAGER");

  // â€” Filter state
  const [statusFilter,   setStatusFilter]   = useState("");
  const [filterVisible,  setFilterVisible]  = useState(false);

  // â€” Modal state
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editCustomer,   setEditCustomer]   = useState<Customer | null>(null);
  const [viewCustomer,   setViewCustomer]   = useState<Customer | null>(null);
  const [confirmToggle,  setConfirmToggle]  = useState<Customer | null>(null);
  const [importOpen,     setImportOpen]     = useState(false);

  // â€” Row selection + export
  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  // â€” Pagination
  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "full_name", initialSortDirection: "asc" });

  // â€” Filters
  const activeFilters = {
    ...(statusFilter && { is_active: statusFilter === "true" }),
  };

  const hasActiveFilters  = statusFilter !== "";
  const activeFilterCount = statusFilter ? 1 : 0;

  function clearFilters() {
    setStatusFilter("");
    goToPage(1);
  }

  function hideFilters() {
    clearFilters();
    setFilterVisible(false);
  }

  // â€” Data fetching
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<Customer>>({
    queryKey:        ["customers", queryParams, activeFilters],
    queryFn:         () => apiGet<PaginatedResponse<Customer>>("/customers", { ...queryParams, ...activeFilters }),
    placeholderData: keepPreviousData,
  });

  const customers  = data?.data        ?? [];
  const totalItems = data?.total        ?? 0;
  const totalPages = data?.total_pages  ?? 1;

  // â€” Toggle-status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: (customer: Customer) =>
      apiPatch<Customer>(`/customers/${customer.id}`, { is_active: !customer.is_active }),
    onSuccess: (_, customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      showToast(
        "success",
        customer.is_active ? "Customer Deactivated" : "Customer Activated",
        customer.is_active
          ? `${customer.full_name} has been deactivated.`
          : `${customer.full_name} is now active.`
      );
      setConfirmToggle(null);
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Status Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // â€” Selection helpers
  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys     = customers.map((c) => c.id);
  const allOnPageSelected   = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = customers.filter((c) => selectedKeys.has(c.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // â€” Export handlers
  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const exportParams: Record<string, unknown> = {};
        if (statusFilter) exportParams.is_active = statusFilter === "true";
        if (search)       exportParams.search     = search;
        const blob = await apiDownloadFile("/customers/export", exportParams);
        downloadBlob(blob, `customers_${exportDateStamp()}.csv`);
      } catch {
        showToast("error", "Export Failed", "Could not export records. Please try again.");
      } finally {
        setIsExportingCsv(false);
      }
    } else {
      exportSelectedCsv(selectedItems);
    }
  }

  function handleExportPdf() { exportSelectedPdf(selectedItems); }

  async function handleImport(file: File): Promise<ImportResult> {
    const result = await apiUploadFile<ImportResult>("/customers/import", file);
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    return result;
  }

  async function handleDownloadTemplate(): Promise<void> {
    const blob = await apiDownloadFile("/customers/import/template");
    downloadBlob(blob, "customers_import_template.csv");
  }

  // â€” Column definitions
  const columns: Column<Customer>[] = [
    {
      key:      "full_name",
      header:   "Customer",
      sortable: true,
      render:   (c) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{c.full_name}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{formatPhoneNumber(c.phone)}</p>
        </div>
      ),
    },
    {
      key:    "email",
      header: "Email",
      render: (c) => <span style={{ color: "var(--color-text-muted)" }}>{c.email ?? "â€”"}</span>,
    },
    {
      key:      "credit_limit",
      header:   "Credit Limit",
      sortable: true,
      render:   (c) => (
        <span className="tabular-nums" style={{ color: "var(--color-text)" }}>
          {c.credit_limit.toFixed(2)}
        </span>
      ),
    },
    {
      key:    "outstanding_balance",
      header: "Outstanding",
      render: (c) => (
        <span
          className={`tabular-nums font-medium ${c.outstanding_balance > 0 ? "text-warning-600" : ""}`}
          style={c.outstanding_balance === 0 ? { color: "var(--color-text-muted)" } : undefined}
        >
          {c.outstanding_balance.toFixed(2)}
        </span>
      ),
    },
    {
      key:    "is_active",
      header: "Status",
      render: (c) => (
        <Badge variant={getActiveStatusVariant(c.is_active)} dot>
          {c.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key:    "actions",
      header: "Actions",
      width:  "110px",
      render: (c) => (
        <div className="flex items-center gap-0.5">
          <button
            title="View Details"
            onClick={(e) => { e.stopPropagation(); setViewCustomer(c); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {canManage && (
            <button
              title="Edit"
              onClick={(e) => { e.stopPropagation(); setEditCustomer(c); setModalOpen(true); }}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {canManage && (
            <button
              title={c.is_active ? "Deactivate" : "Activate"}
              onClick={(e) => { e.stopPropagation(); setConfirmToggle(c); }}
              className={
                c.is_active
                  ? "p-1.5 rounded-md transition-colors text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  : "p-1.5 rounded-md transition-colors text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }
            >
              {c.is_active
                ? <UserX className="w-3.5 h-3.5" />
                : <UserCheck className="w-3.5 h-3.5" />
              }
            </button>
          )}
        </div>
      ),
    },
  ];

  const isDeactivating = confirmToggle?.is_active === true;

  return (
    <div className="page-container">

      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Contact className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Customer Management</h1>
          </div>
          <p className="page-subtitle mt-1">Manage customer accounts and credit limits</p>
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
            placeholder="Search by name, phone or emailâ€¦"
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
                onClick={() => { setEditCustomer(null); setModalOpen(true); }}
              >
                New Customer
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ Filter bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <FilterBar isVisible={filterVisible} hasActiveFilters={hasActiveFilters} onClear={clearFilters} onHide={hideFilters}>
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

      {/* â”€â”€ Table card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

        <DataTable<Customer>
          columns={columns}
          data={customers}
          isLoading={isLoading}
          rowKey={(c) => c.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No customers found matching "${search}"` : "No customers found."}
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

            />
          )}
        </div>

        {/* Export footer â€” shown only when rows are selected */}
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

      {/* â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <CustomerModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditCustomer(null); }}
        editingCustomer={editCustomer}
      />

      <CustomerViewModal
        isOpen={!!viewCustomer}
        onClose={() => setViewCustomer(null)}
        customer={viewCustomer}
        onEdit={() => { setEditCustomer(viewCustomer); setModalOpen(true); setViewCustomer(null); }}
      />

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Customers"
        onImport={handleImport}
        onDownloadTemplate={handleDownloadTemplate}
        templateNote="Required columns: full_name, phone â€” Optional: email, date_of_birth (yyyy-MM-dd), address, credit_limit"
      />

      <ConfirmModal
        isOpen={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        title={isDeactivating ? "Deactivate Customer" : "Activate Customer"}
        body={
          isDeactivating ? (
            <>Are you sure you want to deactivate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{confirmToggle?.full_name}</span>?
            </>
          ) : (
            <>Are you sure you want to activate{" "}
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{confirmToggle?.full_name}</span>?
            </>
          )
        }
        confirmLabel={isDeactivating ? "Deactivate" : "Activate"}
        variant={isDeactivating ? "danger" : "primary"}
        onConfirm={() => confirmToggle && toggleStatusMutation.mutate(confirmToggle)}
        isLoading={toggleStatusMutation.isPending}
      />
    </div>
  );
}
