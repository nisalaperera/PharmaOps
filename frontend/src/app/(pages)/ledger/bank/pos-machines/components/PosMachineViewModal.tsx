"use client";

import { useState }                   from "react";
import { useQuery }                    from "@tanstack/react-query";
import { Plus, RefreshCw, Banknote }   from "lucide-react";
import { Modal }                       from "@/components/ui/Modal";
import { Badge }                       from "@/components/ui/Badge";
import { Button }                      from "@/components/ui/Button";
import { apiGet }                      from "@/lib/api-client";
import { formatDate, formatDateTime }  from "@/lib/utils";
import { getActiveStatusVariant, POS_CARD_TYPE_VARIANT } from "@/lib/badges";
import { POS_CARD_TYPE_FILTER_OPTIONS } from "@/lib/constants";
import { PosTransactionModal }         from "./PosTransactionModal";
import { PosSettleModal }              from "./PosSettleModal";
import type { PosMachine, PosTransaction, PosSettlement, PaginatedResponse } from "@/types";

interface PosMachineViewModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  machine:    PosMachine | null;
  canManage:  boolean;
}

export function PosMachineViewModal({ isOpen, onClose, machine, canManage }: PosMachineViewModalProps) {
  const [cardTypeFilter,    setCardTypeFilter]    = useState("");
  const [settledFilter,     setSettledFilter]     = useState("");
  const [txnModalOpen,      setTxnModalOpen]      = useState(false);
  const [settleModalOpen,   setSettleModalOpen]   = useState(false);
  const [activeTab,         setActiveTab]         = useState<"transactions" | "settlements">("transactions");

  const { data: txnData, isLoading: txnLoading, refetch: refetchTxns } = useQuery<PaginatedResponse<PosTransaction>>({
    queryKey: ["pos-transactions", machine?.id, cardTypeFilter, settledFilter],
    queryFn:  () => apiGet<PaginatedResponse<PosTransaction>>(
      `/treasury/bank-accounts/pos-machines/machines/${machine!.id}/transactions`,
      {
        page_size: 200,
        ...(cardTypeFilter && { card_type: cardTypeFilter }),
        ...(settledFilter  && { is_settled: settledFilter }),
      },
    ),
    enabled: isOpen && !!machine && activeTab === "transactions",
  });

  const { data: settlementData, isLoading: settlementLoading, refetch: refetchSettlements } = useQuery<PaginatedResponse<PosSettlement>>({
    queryKey: ["pos-settlements", machine?.id],
    queryFn:  () => apiGet<PaginatedResponse<PosSettlement>>(
      `/treasury/bank-accounts/pos-machines/machines/${machine!.id}/settlements`,
      { page_size: 100 },
    ),
    enabled: isOpen && !!machine && activeTab === "settlements",
  });

  if (!machine) return null;

  const transactions = txnData?.data ?? [];
  const settlements  = settlementData?.data ?? [];
  const canSettle    = canManage && machine.is_active && machine.unsettled_amount > 0;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="POS Machine Details" size="xl">
        {/* ── Status + Settle ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant={getActiveStatusVariant(machine.is_active)} dot>
              {machine.is_active ? "Active" : "Inactive"}
            </Badge>
            {machine.unsettled_amount > 0 && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
              >
                LKR {machine.unsettled_amount.toFixed(2)} unsettled
              </span>
            )}
          </div>
          {canSettle && (
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Banknote className="w-3.5 h-3.5" />}
              onClick={() => setSettleModalOpen(true)}
            >
              Settle
            </Button>
          )}
        </div>

        {/* ── Info grid ──────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mb-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Terminal ID</dt>
            <dd className="text-sm mt-0.5 font-semibold font-mono" style={{ color: "var(--color-text)" }}>
              {machine.terminal_id}
            </dd>
          </div>
          {machine.merchant_id && (
            <div>
              <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Merchant ID</dt>
              <dd className="text-sm mt-0.5 font-mono" style={{ color: "var(--color-text)" }}>{machine.merchant_id}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Bank Account</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{machine.bank_account_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Bank</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{machine.bank_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Branch</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{machine.branch_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Last Settled</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {machine.last_settled_at ? formatDateTime(machine.last_settled_at) : "—"}
            </dd>
          </div>
          {machine.notes && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Notes</dt>
              <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{machine.notes}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Created</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {formatDateTime(machine.created_at)}
            </dd>
          </div>
          {machine.created_by_name && (
            <div>
              <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Created By</dt>
              <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{machine.created_by_name}</dd>
            </div>
          )}
        </dl>

        {/* ── Tabs ───────────────────────────────────────────────────────────── */}
        <div className="border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-1 mb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
            {(["transactions", "settlements"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2 text-sm font-medium transition-colors capitalize"
                style={{
                  color:       activeTab === tab ? "var(--color-primary)" : "var(--color-text-muted)",
                  borderBottom: activeTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Transactions tab */}
          {activeTab === "transactions" && (
            <>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  Transactions
                  {txnData && (
                    <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>
                      ({txnData.total})
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    value={cardTypeFilter}
                    onChange={(e) => setCardTypeFilter(e.target.value)}
                    className="form-select text-xs h-8 py-1 pl-2 pr-7"
                  >
                    {POS_CARD_TYPE_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select
                    value={settledFilter}
                    onChange={(e) => setSettledFilter(e.target.value)}
                    className="form-select text-xs h-8 py-1 pl-2 pr-7"
                  >
                    <option value="">All</option>
                    <option value="false">Unsettled</option>
                    <option value="true">Settled</option>
                  </select>
                  <button
                    title="Refresh"
                    onClick={() => refetchTxns()}
                    className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  {machine.is_active && (
                    <Button
                      size="sm"
                      variant="primary"
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      onClick={() => setTxnModalOpen(true)}
                    >
                      Add Transaction
                    </Button>
                  )}
                </div>
              </div>

              {txnLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="w-6 h-6 border-2 border-current/20 border-t-primary-500 rounded-full animate-spin" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }}>
                  No transactions recorded yet.
                </p>
              ) : (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Card Type</th>
                        <th>Reference</th>
                        <th className="text-right">Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((txn) => (
                        <tr key={txn.id}>
                          <td>
                            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                              {formatDate(txn.transaction_date)}
                            </span>
                          </td>
                          <td>
                            <Badge variant={POS_CARD_TYPE_VARIANT[txn.card_type]}>
                              {txn.card_type}
                            </Badge>
                          </td>
                          <td>
                            <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                              {txn.reference_number || "—"}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="tabular-nums text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                              LKR {txn.amount.toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <Badge variant={txn.is_settled ? "success" : "warning"}>
                              {txn.is_settled ? "Settled" : "Unsettled"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Settlements tab */}
          {activeTab === "settlements" && (
            <>
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  Settlement History
                  {settlementData && (
                    <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>
                      ({settlementData.total})
                    </span>
                  )}
                </h3>
                <button
                  title="Refresh"
                  onClick={() => refetchSettlements()}
                  className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {settlementLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="w-6 h-6 border-2 border-current/20 border-t-primary-500 rounded-full animate-spin" />
                </div>
              ) : settlements.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }}>
                  No settlements yet.
                </p>
              ) : (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Settlement Date</th>
                        <th>Transactions</th>
                        <th className="text-right">Total Deposited</th>
                        <th>Settled By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                              {formatDate(s.settlement_date)}
                            </span>
                          </td>
                          <td>
                            <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                              {s.transaction_count}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="tabular-nums text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                              LKR {s.total_amount.toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                              {s.created_by_name || "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* ── Nested modals ──────────────────────────────────────────────────────── */}
      <PosTransactionModal
        isOpen={txnModalOpen}
        onClose={() => setTxnModalOpen(false)}
        machine={machine}
      />

      <PosSettleModal
        isOpen={settleModalOpen}
        onClose={() => setSettleModalOpen(false)}
        machine={machine}
      />
    </>
  );
}
