"use client";

import { Modal }           from "@/components/ui/Modal";
import { Badge }           from "@/components/ui/Badge";
import { Button }          from "@/components/ui/Button";
import { RotateCcw }       from "lucide-react";
import { formatDateTime }  from "@/lib/utils";
import { SALE_STATUS_VARIANT, PAYMENT_METHOD_VARIANT } from "@/lib/badges";
import { PAYMENT_METHOD_LABEL, SALE_STATUS_LABEL }     from "@/lib/constants";
import type { Sale } from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SaleViewModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  sale:       Sale | null;
  canRefund:  boolean;
  onRefund:   (sale: Sale) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SaleViewModal({ isOpen, onClose, sale, canRefund, onRefund }: SaleViewModalProps) {
  if (!sale) return null;

  const shortId = sale.id.slice(-8).toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Sale #${shortId}`}
      size="lg"
      headerExtra={
        <Badge variant={SALE_STATUS_VARIANT[sale.status]}>
          {SALE_STATUS_LABEL[sale.status] ?? sale.status}
        </Badge>
      }
    >
      <div className="space-y-5">

        {/* ── Meta ─────────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Date / Time</dt>
            <dd className="text-sm mt-0.5 font-mono" style={{ color: "var(--color-text)" }}>
              {formatDateTime(sale.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Cashier</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{sale.cashier_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Customer</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {sale.customer_name || <span style={{ color: "var(--color-text-muted)" }}>Walk-in</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Payment Method</dt>
            <dd className="mt-0.5">
              <Badge variant={PAYMENT_METHOD_VARIANT[sale.payment_method] ?? "default"}>
                {PAYMENT_METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Items</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{sale.items.length}</dd>
          </div>
          {sale.cheque_details && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Cheque Details</dt>
              <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
                #{sale.cheque_details.cheque_number} · {sale.cheque_details.bank_name} · Clears {sale.cheque_details.clearance_date}
              </dd>
            </div>
          )}
        </dl>

        {/* ── Items table ───────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Items
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th className="text-center">Qty</th>
                  <th className="text-right">Unit Price</th>
                  <th className="text-right">Discount</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <span className="font-medium text-sm" style={{ color: "var(--color-text)" }}>
                        {item.product_name}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {item.batch_number}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="text-sm tabular-nums" style={{ color: "var(--color-text)" }}>
                        {item.quantity}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="text-sm tabular-nums" style={{ color: "var(--color-text)" }}>
                        {item.unit_price.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="text-sm tabular-nums text-danger-500">
                        {item.discount > 0 ? `-${item.discount.toFixed(2)}` : "—"}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
                        {item.total_price.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Financial summary ─────────────────────────────────────────────── */}
        <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-muted)" }}>Subtotal</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>LKR {sale.subtotal.toFixed(2)}</span>
          </div>
          {sale.discount_total > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Discount</span>
              <span className="tabular-nums text-danger-500">-LKR {sale.discount_total.toFixed(2)}</span>
            </div>
          )}
          <div className="h-px" style={{ background: "var(--color-border)" }} />
          <div className="flex justify-between font-bold">
            <span style={{ color: "var(--color-text)" }}>Total</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>LKR {sale.total_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-muted)" }}>Paid</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>LKR {sale.paid_amount.toFixed(2)}</span>
          </div>
          {sale.payment_method === "CASH" && sale.change_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Change</span>
              <span className="tabular-nums font-semibold" style={{ color: "#10b981" }}>LKR {sale.change_amount.toFixed(2)}</span>
            </div>
          )}
          {(sale.refund_amount ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Refunded</span>
              <span className="tabular-nums font-semibold text-danger-500">LKR {(sale.refund_amount ?? 0).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        {canRefund && sale.status === "COMPLETED" && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              leftIcon={<RotateCcw className="w-4 h-4" />}
              onClick={() => { onClose(); onRefund(sale); }}
            >
              Process Refund
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
