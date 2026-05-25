"use client";

import { useQuery } from "@tanstack/react-query";
import { Modal }  from "@/components/ui/Modal";
import { Badge }  from "@/components/ui/Badge";
import { apiGet } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import { getActiveStatusVariant, getRegistryStatusVariant, REGISTRY_TRANSACTION_VARIANT } from "@/lib/badges";
import { REGISTRY_TRANSACTION_TYPE_LABEL } from "@/lib/constants";
import type { CashRegistry, CashRegistryTransaction } from "@/types";

interface CashRegistryViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  registry: CashRegistry | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <div className="text-sm" style={{ color: "var(--color-text)" }}>
        {children}
      </div>
    </div>
  );
}

function EmptyValue() {
  return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
}

export function CashRegistryViewModal({ isOpen, onClose, registry }: CashRegistryViewModalProps) {
  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery<
    CashRegistryTransaction[]
  >({
    queryKey: ["registry-transactions", registry?.id],
    queryFn:  () =>
      apiGet<CashRegistryTransaction[]>(`/treasury/registries/${registry!.id}/transactions`),
    enabled:  isOpen && registry !== null,
  });

  if (!registry) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registry Details"
      size="xl"
    >
      <div className="space-y-5">

        {/* Status badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={getRegistryStatusVariant(registry.is_open)} dot>
            {registry.is_open ? "Open" : "Closed"}
          </Badge>
          <Badge variant={getActiveStatusVariant(registry.is_active)} dot>
            {registry.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">{registry.name}</Field>
          <Field label="Branch">{registry.branch_name}</Field>
          <Field label="Current Balance">
            <span
              className="font-semibold tabular-nums"
              style={{ color: registry.current_balance > 0 ? "var(--color-text)" : "var(--color-text-muted)" }}
            >
              LKR {registry.current_balance.toFixed(2)}
            </span>
          </Field>
          <Field label="Responsible Staff">
            {registry.responsible_staff_name ?? <EmptyValue />}
          </Field>
          <Field label="Created">
            {registry.created_at ? formatDateTime(registry.created_at) : <EmptyValue />}
          </Field>
          <Field label="Updated">
            {registry.updated_at ? formatDateTime(registry.updated_at) : <EmptyValue />}
          </Field>
          {registry.created_by_name && (
            <Field label="Created By">{registry.created_by_name}</Field>
          )}
          {registry.updated_by_name && (
            <Field label="Updated By">{registry.updated_by_name}</Field>
          )}
        </div>

        {/* Transaction history */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Transaction History
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>

          {isLoadingTransactions ? (
            <div className="flex items-center justify-center py-8">
              <span
                className="w-6 h-6 border-[3px] border-current/20 border-t-primary-500 rounded-full animate-spin"
                style={{ color: "var(--color-text-muted)" }}
              />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }}>
              No transactions recorded yet.
            </p>
          ) : (
            <div
              className="rounded-xl overflow-hidden border"
              style={{ borderColor: "var(--color-border)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-xs font-semibold uppercase tracking-wider border-b"
                    style={{
                      background:   "var(--color-surface-2)",
                      borderColor:  "var(--color-border)",
                      color:        "var(--color-text-muted)",
                    }}
                  >
                    <th className="px-3 py-2 text-left">Date / Time</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance After</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, index) => (
                    <tr
                      key={tx.id}
                      className="border-b last:border-b-0"
                      style={{
                        borderColor: "var(--color-border)",
                        background:  index % 2 === 0 ? "var(--color-surface)" : "var(--color-surface-2)",
                      }}
                    >
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {formatDateTime(tx.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={REGISTRY_TRANSACTION_VARIANT[tx.type]}>
                          {REGISTRY_TRANSACTION_TYPE_LABEL[tx.type]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: "var(--color-text)" }}>
                        LKR {tx.amount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                        LKR {tx.balance_after.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {tx.notes ?? <span>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
