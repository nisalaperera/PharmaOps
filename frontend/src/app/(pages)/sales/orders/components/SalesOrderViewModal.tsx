"use client";

import { Modal }  from "@/components/ui/Modal";
import { Badge }  from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { SALES_ORDER_STATUS_VARIANT, SALES_ORDER_STATUS_LABEL } from "@/lib/badges";
import type { SalesOrder } from "@/types";

interface SalesOrderViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  order:   SalesOrder | null;
}

export function SalesOrderViewModal({ isOpen, onClose, order }: SalesOrderViewModalProps) {
  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sales Order" size="lg">
      <div className="space-y-6">

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Order #</dt>
            <dd className="text-sm font-mono font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              #{order.id.slice(-8).toUpperCase()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Status</dt>
            <dd className="mt-1">
              <Badge variant={SALES_ORDER_STATUS_VARIANT[order.status]}>
                {SALES_ORDER_STATUS_LABEL[order.status]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Customer</dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: order.customer_name ? "var(--color-text)" : "var(--color-text-muted)" }}>
              {order.customer_name || "Walk-in"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Created By</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{order.created_by_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Created At</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{formatDateTime(order.created_at)}</dd>
          </div>
          {order.confirmed_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Confirmed At</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{formatDateTime(order.confirmed_at)}</dd>
            </div>
          )}
          {order.invoiced_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Invoiced At</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{formatDateTime(order.invoiced_at)}</dd>
            </div>
          )}
          {order.cancelled_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Cancelled At</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{formatDateTime(order.cancelled_at)}</dd>
            </div>
          )}
          {order.notes && (
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Notes</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{order.notes}</dd>
            </div>
          )}
        </dl>

        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
            Items ({order.items.length})
          </h3>
          <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  {["Product", "Qty", "Unit Price", "Discount", "Total"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => (
                  <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>{item.product_name}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.quantity}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.unit_price.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                      {item.discount > 0 ? `-${item.discount.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>
                      {item.total_price.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {order.discount_total > 0 && (
                  <tr className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Subtotal</td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--color-text)" }}>{order.subtotal.toFixed(2)}</td>
                  </tr>
                )}
                {order.discount_total > 0 && (
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-medium text-danger-500">Discount</td>
                    <td className="px-3 py-1.5 tabular-nums text-danger-500">-{order.discount_total.toFixed(2)}</td>
                  </tr>
                )}
                <tr className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                  <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Total</td>
                  <td className="px-3 py-2 tabular-nums font-bold" style={{ color: "var(--color-text)" }}>{order.total_amount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </Modal>
  );
}
