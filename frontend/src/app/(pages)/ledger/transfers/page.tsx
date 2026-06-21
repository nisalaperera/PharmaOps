"use client";

import { useState, useCallback }     from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowRightLeft, Plus, Eye, FileDown, FileText } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import APP_CONFIG from "@/lib/config";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { SearchBar }               from "@/components/common/SearchBar";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { useAuth }                 from "@/hooks/useAuth";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet, downloadBlob }    from "@/lib/api-client";
import { FUND_SOURCE_TYPE_LABEL }  from "@/lib/constants";
import { FundTransferModal }       from "@/app/(pages)/ledger/transfers/components/FundTransferModal";
import { FundTransferViewModal }   from "@/app/(pages)/ledger/transfers/components/FundTransferViewModal";
import { formatAmount }                from "@/lib/utils";
import type { FundTransfer, PaginatedResponse } from "@/types";

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportDateStamp(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function buildRow(transfer: FundTransfer): string[] {
  return [
    transfer.transfer_date,
    transfer.from_source_name,
    transfer.to_source_name,
    `LKR ${formatAmount(transfer.amount)}`,
    transfer.notes ?? "",
  ];
}

function exportSelectedCsv(selected: FundTransfer[]) {
  const header  = ["Transfer Date", "From", "To", "Amount", "Notes"];
  const rows    = selected.map(buildRow);
  const csvText = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `fund_transfers_${exportDateStamp()}.csv`);
}

async function exportSelectedPdf(selected: FundTransfer[]) {
  const doc  = new jsPDF();
  const head = [["Transfer Date", "From", "To", "Amount", "Notes"]];
  const body = selected.map(buildRow);

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
  doc.text("Fund Transfers Report — " + exportDateStamp(), 14, cursorY + 4);
  cursorY += 10;

  autoTable(doc, { head, body, startY: cursorY, styles: { fontSize: 8 } });

  doc.save(`fund_transfers_${exportDateStamp()}.pdf`);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function FundTransfersPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;

  // ── Filter state ───────────────────────────────────────────────────────────


  // ── Modal state ────────────────────────────────────────────────────────────

  const [modalOpen,    setModalOpen]    = useState(false);
  const [viewTransfer, setViewTransfer] = useState<FundTransfer | null>(null);

  // ── Row selection ──────────────────────────────────────────────────────────

  const [selectedKeys,     setSelectedKeys]     = useState<Set<string>>(new Set());
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const [isExportingCsv,   setIsExportingCsv]   = useState(false);

  // ── Pagination ─────────────────────────────────────────────────────────────

  const { pagination, sort, search, goToPage, changePageSize, handleSort, handleSearch, queryParams } =
    usePagination({ initialSortField: "transfer_date", initialSortDirection: "desc" });

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<FundTransfer>>({
    queryKey:        ["transfers", queryParams],
    queryFn:         () => apiGet<PaginatedResponse<FundTransfer>>("/treasury/transfers", queryParams),
    placeholderData: keepPreviousData,
  });

  const transfers  = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ── Selection helpers ──────────────────────────────────────────────────────

  const handleSelectionChange = useCallback((keys: Set<string>) => {
    setSelectedKeys(keys);
    setAllPagesSelected(false);
  }, []);

  const currentPageKeys    = transfers.map((i) => i.id);
  const allOnPageSelected  = currentPageKeys.length > 0 && currentPageKeys.every((k) => selectedKeys.has(k));
  const showSelectAllBanner = allOnPageSelected && !allPagesSelected && totalItems > pagination.pageSize;

  function handleSelectAllPages() { setAllPagesSelected(true); }
  function clearSelection() { setSelectedKeys(new Set()); setAllPagesSelected(false); }

  const selectedItems  = transfers.filter((i) => selectedKeys.has(i.id));
  const selectionCount = allPagesSelected ? totalItems : selectedKeys.size;

  // ── Export handlers ────────────────────────────────────────────────────────

  async function handleExportCsv() {
    if (allPagesSelected) {
      setIsExportingCsv(true);
      try {
        const allData = await apiGet<PaginatedResponse<FundTransfer>>("/treasury/transfers", {
          ...queryParams,
          page: 1,
          page_size: totalItems,
        });
        exportSelectedCsv(allData.data);
      } catch {
        // Export failure is non-fatal
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

  // ── Column definitions ─────────────────────────────────────────────────────

  const columns: Column<FundTransfer>[] = [
    {
      key:      "transfer_date",
      header:   "Transfer Date",
      sortable: true,
      render:   (row) => (
        <span className="font-mono text-sm" style={{ color: "var(--color-text)" }}>
          {row.transfer_date}
        </span>
      ),
    },
    {
      key:    "from_source_name",
      header: "From",
      render: (row) => (
        <div>
          <Badge variant="info" className="mb-1">
            {FUND_SOURCE_TYPE_LABEL[row.from_source_type]}
          </Badge>
          <p className="text-sm" style={{ color: "var(--color-text)" }}>
            {row.from_source_name}
          </p>
        </div>
      ),
    },
    {
      key:    "to_source_name",
      header: "To",
      render: (row) => (
        <div>
          <Badge variant="success" className="mb-1">
            {FUND_SOURCE_TYPE_LABEL[row.to_source_type]}
          </Badge>
          <p className="text-sm" style={{ color: "var(--color-text)" }}>
            {row.to_source_name}
          </p>
        </div>
      ),
    },
    {
      key:      "amount",
      header:   "Amount",
      sortable: true,
      render:   (row) => (
        <span className="tabular-nums font-semibold text-sm" style={{ color: "var(--color-text)" }}>
          LKR {formatAmount(row.amount)}
        </span>
      ),
    },
    {
      key:    "notes",
      header: "Notes",
      render: (row) =>
        row.notes ? (
          <span
            className="text-sm"
            style={{
              color:        "var(--color-text-muted)",
              maxWidth:     "200px",
              display:      "block",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}
            title={row.notes}
          >
            {row.notes}
          </span>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>&mdash;</span>
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
            onClick={(e) => { e.stopPropagation(); setViewTransfer(row); }}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Eye className="w-3.5 h-3.5" />
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
            <ArrowRightLeft className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Fund Transfers</h1>
          </div>
          <p className="page-subtitle mt-1">
            Track fund movements between cash registries and bank accounts
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SearchBar
            placeholder="Search by source or destination..."
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
                New Transfer
              </Button>
            </div>
          )}
        </div>
      </div>

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

        <DataTable<FundTransfer>
          columns={columns}
          data={transfers}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage={search ? `No fund transfers found matching "${search}"` : "No fund transfers found."}
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

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <FundTransferModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      <FundTransferViewModal
        isOpen={!!viewTransfer}
        onClose={() => setViewTransfer(null)}
        transfer={viewTransfer}
      />
    </div>
  );
}
