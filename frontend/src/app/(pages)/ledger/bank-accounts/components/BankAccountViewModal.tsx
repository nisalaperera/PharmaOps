"use client";

import { useQuery }        from "@tanstack/react-query";
import { Modal }           from "@/components/ui/Modal";
import { Badge }           from "@/components/ui/Badge";
import { apiGet }          from "@/lib/api-client";
import { formatDateTime }  from "@/lib/utils";
import { getActiveStatusVariant } from "@/lib/badges";
import type { BankAccount, BankAccountTransaction } from "@/types";

// ─── Transaction type color helper ────────────────────────────────────────────

function getTransactionTypeColor(transactionType: string): string {
  switch (transactionType) {
    case "DEPOSIT":
    case "TRANSFER_IN":
      return "text-emerald-600 dark:text-emerald-400";
    case "WITHDRAWAL":
    case "TRANSFER_OUT":
      return "text-danger-600 dark:text-danger-400";
    default:
      return "var(--color-text)";
  }
}

function formatTransactionTypeLabel(transactionType: string): string {
  return transactionType
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface BankAccountViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  account:  BankAccount | null;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function BankAccountViewModal({ isOpen, onClose, account }: BankAccountViewModalProps) {
  const { data: transactions, isLoading: loadingTransactions } = useQuery<BankAccountTransaction[]>({
    queryKey: ["bank-account-transactions", account?.id],
    queryFn:  () => apiGet<BankAccountTransaction[]>(`/treasury/bank-accounts/${account!.id}/transactions`),
    enabled:  isOpen && !!account,
  });

  if (!account) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bank Account Details"
      size="lg"
    >
      {/* Status badge */}
      <div className="mb-5">
        <Badge variant={getActiveStatusVariant(account.is_active)} dot>
          {account.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Info grid */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Account Name
          </dt>
          <dd className="text-sm mt-0.5 font-semibold" style={{ color: "var(--color-text)" }}>
            {account.account_name}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Account Number
          </dt>
          <dd className="text-sm mt-0.5 font-mono" style={{ color: "var(--color-text)" }}>
            {account.account_number}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Bank Name
          </dt>
          <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
            {account.bank_name}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Branch
          </dt>
          <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
            {account.branch_name}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Current Balance
          </dt>
          <dd className="text-sm mt-0.5 font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
            LKR {account.current_balance.toFixed(2)}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Created
          </dt>
          <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
            {formatDateTime(account.created_at)}
          </dd>
        </div>

        {account.updated_at && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Last Updated
            </dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {formatDateTime(account.updated_at)}
            </dd>
          </div>
        )}

        {account.created_by_name && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Created By
            </dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {account.created_by_name}
            </dd>
          </div>
        )}
      </dl>

      {/* Transaction history */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
          Transaction History
        </h3>

        {loadingTransactions ? (
          <div className="flex items-center justify-center py-8">
            <span
              className="w-6 h-6 border-2 border-current/20 border-t-primary-500 rounded-full animate-spin"
              style={{ color: "var(--color-text-muted)" }}
            />
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }}>
            No transactions yet.
          </p>
        ) : (
          <div
            className="rounded-xl overflow-hidden border"
            style={{ borderColor: "var(--color-border)" }}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Type</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Balance After</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      <span className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {formatDateTime(transaction.created_at)}
                      </span>
                    </td>
                    <td>
                      <span className={`text-xs font-semibold ${getTransactionTypeColor(transaction.type)}`}>
                        {formatTransactionTypeLabel(transaction.type)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="tabular-nums text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        LKR {transaction.amount.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="tabular-nums text-sm" style={{ color: "var(--color-text-muted)" }}>
                        LKR {transaction.balance_after.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {transaction.notes ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
