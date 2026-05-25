"use client";

import { useState }     from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowRightLeft, Plus, Eye } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Pagination }              from "@/components/common/Pagination";
import { Button }                  from "@/components/ui/Button";
import { Badge }                   from "@/components/ui/Badge";
import { useAuth }                 from "@/hooks/useAuth";
import { usePagination }           from "@/hooks/usePagination";
import { apiGet }                  from "@/lib/api-client";
import { FUND_SOURCE_TYPE_LABEL }  from "@/lib/constants";
import { FundTransferModal }       from "@/app/(pages)/ledger/transfers/components/FundTransferModal";
import { FundTransferViewModal }   from "@/app/(pages)/ledger/transfers/components/FundTransferViewModal";
import type { FundTransfer, PaginatedResponse } from "@/types";

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function FundTransfersPage() {
  const { permissions } = useAuth();
  const canManage       = permissions?.can("BRANCH_MANAGER") ?? false;

  // â”€â”€ Modal state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [modalOpen,    setModalOpen]    = useState(false);
  const [viewTransfer, setViewTransfer] = useState<FundTransfer | null>(null);

  // â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { pagination, sort, goToPage, changePageSize, handleSort, queryParams } =
    usePagination({ initialSortField: "transfer_date", initialSortDirection: "desc" });

  // â”€â”€ Data fetching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<FundTransfer>>({
    queryKey:        ["transfers", queryParams],
    queryFn:         () => apiGet<PaginatedResponse<FundTransfer>>("/treasury/transfers", queryParams),
    placeholderData: keepPreviousData,
  });

  const transfers  = data?.data        ?? [];
  const totalItems = data?.total       ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // â”€â”€ Column definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          LKR {row.amount.toFixed(2)}
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
          <span style={{ color: "var(--color-text-muted)" }}>â€”</span>
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

      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
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

      {/* â”€â”€ Table card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="rounded-2xl shadow-card overflow-hidden" style={{ background: "var(--color-surface)" }}>
        <DataTable<FundTransfer>
          columns={columns}
          data={transfers}
          isLoading={isLoading}
          isFetching={isFetching}
          rowKey={(row) => row.id}
          sort={sort}
          onSort={handleSort}
          emptyMessage="No fund transfers found."
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
      </div>

      {/* â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
