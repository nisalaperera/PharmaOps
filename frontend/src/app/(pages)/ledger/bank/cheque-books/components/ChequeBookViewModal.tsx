"use client";

import { useState }                        from "react";
import { useQuery }                         from "@tanstack/react-query";
import { Plus, RefreshCw }                  from "lucide-react";
import { Modal }                            from "@/components/ui/Modal";
import { Badge }                            from "@/components/ui/Badge";
import { Button }                           from "@/components/ui/Button";
import { apiGet }                           from "@/lib/api-client";
import { formatDate, formatDateTime }       from "@/lib/utils";
import { getActiveStatusVariant, CHEQUE_ISSUE_STATUS_VARIANT } from "@/lib/badges";
import { CHEQUE_ISSUE_STATUS_FILTER_OPTIONS }                  from "@/lib/constants";
import { ChequeIssueModal }                 from "./ChequeIssueModal";
import { UpdateChequeStatusModal }          from "./UpdateChequeStatusModal";
import type { ChequeBook, ChequeIssue, PaginatedResponse } from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChequeBookViewModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  book:       ChequeBook | null;
  canManage:  boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChequeBookViewModal({ isOpen, onClose, book, canManage }: ChequeBookViewModalProps) {
  const [statusFilter,     setStatusFilter]     = useState("");
  const [issueModalOpen,   setIssueModalOpen]   = useState(false);
  const [updatingIssue,    setUpdatingIssue]    = useState<ChequeIssue | null>(null);

  const { data, isLoading, refetch } = useQuery<PaginatedResponse<ChequeIssue>>({
    queryKey: ["cheque-issues", book?.id, statusFilter],
    queryFn:  () => apiGet<PaginatedResponse<ChequeIssue>>(
      `/treasury/bank-accounts/cheques/books/${book!.id}/issues`,
      { page_size: 200, ...(statusFilter && { status: statusFilter }) },
    ),
    enabled: isOpen && !!book,
  });

  const issues          = data?.data ?? [];
  const availableLeaves = book ? book.total_leaves - book.used_leaves : 0;
  const canIssue        = canManage && !!book?.is_active && availableLeaves > 0;

  if (!book) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Cheque Book Details" size="xl">
        {/* ── Status badge ──────────────────────────────────────────────────── */}
        <div className="mb-5">
          <Badge variant={getActiveStatusVariant(book.is_active)} dot>
            {book.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>

        {/* ── Info grid ─────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Series Name</dt>
            <dd className="text-sm mt-0.5 font-semibold" style={{ color: "var(--color-text)" }}>
              {book.series_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Bank Account</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{book.bank_account_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Bank</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{book.bank_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Branch</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{book.branch_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Cheque Range</dt>
            <dd className="text-sm mt-0.5 font-mono" style={{ color: "var(--color-text)" }}>
              {book.start_number} – {book.end_number}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Leaves</dt>
            <dd className="text-sm mt-0.5 tabular-nums" style={{ color: "var(--color-text)" }}>
              <span className="font-semibold">{availableLeaves}</span>
              <span style={{ color: "var(--color-text-muted)" }}> / {book.total_leaves} available</span>
            </dd>
          </div>
          {book.notes && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Notes</dt>
              <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{book.notes}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Created</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {formatDateTime(book.created_at)}
            </dd>
          </div>
          {book.created_by_name && (
            <div>
              <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Created By</dt>
              <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{book.created_by_name}</dd>
            </div>
          )}
        </dl>

        {/* ── Issues section ────────────────────────────────────────────────── */}
        <div className="border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Issued Cheques
              {data && (
                <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>
                  ({data.total})
                </span>
              )}
            </h3>

            <div className="flex items-center gap-2">
              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-select text-xs h-8 py-1 pl-2 pr-7"
              >
                {CHEQUE_ISSUE_STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <button
                title="Refresh"
                onClick={() => refetch()}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-text-muted)" }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {canIssue && (
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setIssueModalOpen(true)}
                >
                  Issue Cheque
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span
                className="w-6 h-6 border-2 border-current/20 border-t-primary-500 rounded-full animate-spin"
                style={{ color: "var(--color-text-muted)" }}
              />
            </div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }}>
              {statusFilter ? "No cheques match the selected status." : "No cheques issued yet."}
            </p>
          ) : (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cheque #</th>
                    <th>Payee</th>
                    <th>Issue Date</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        <span className="font-mono text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                          #{issue.cheque_number}
                        </span>
                      </td>
                      <td>
                        <div>
                          <p className="text-sm" style={{ color: "var(--color-text)" }}>{issue.payee}</p>
                          {issue.purpose && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                              {issue.purpose}
                            </p>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {formatDate(issue.issue_date)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="tabular-nums text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                          LKR {issue.amount.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <Badge variant={CHEQUE_ISSUE_STATUS_VARIANT[issue.status]}>
                          {issue.status}
                        </Badge>
                      </td>
                      {canManage && (
                        <td>
                          {issue.status === "ISSUED" ? (
                            <button
                              onClick={() => setUpdatingIssue(issue)}
                              className="text-xs font-medium px-2 py-1 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              Update Status
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Nested modals ──────────────────────────────────────────────────────── */}
      <ChequeIssueModal
        isOpen={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        chequeBook={book}
      />

      <UpdateChequeStatusModal
        isOpen={!!updatingIssue}
        onClose={() => setUpdatingIssue(null)}
        issue={updatingIssue}
        bookId={book.id}
      />
    </>
  );
}
