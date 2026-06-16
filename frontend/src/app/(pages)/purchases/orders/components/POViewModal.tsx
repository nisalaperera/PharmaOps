"use client";

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PO_STATUS_LABEL, PO_STATUS_VARIANT } from "@/lib/badges";
import type { PurchaseOrder } from "@/types";

interface POViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  po:            PurchaseOrder | null;
  branchNameMap: Record<string, string>;
}

export function POViewModal({ isOpen, onClose, po, branchNameMap }: POViewModalProps) {
  if (!po) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Purchase Order Details" size="xl">
      <div className="space-y-6">

        {/* ── Summary ──────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Order Number</dt>
            <dd className="text-sm font-mono font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {po.order_number || `#${po.id.slice(0, 8).toUpperCase()}`}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Status</dt>
            <dd className="mt-1">
              <Badge variant={PO_STATUS_VARIANT[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Branch</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {branchNameMap[po.branch_id] ?? po.branch_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Order Date</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {po.order_date ?? "—"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Supplier</dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {po.supplier_name || po.supplier_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Channel</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {po.channel_name || po.channel_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Order Total</dt>
            <dd className="text-sm font-bold tabular-nums mt-1" style={{ color: "var(--color-text)" }}>
              LKR {po.total_amount.toFixed(2)}
            </dd>
          </div>

          {(po.return_amount ?? 0) > 0 && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Return Amount</dt>
              <dd className="text-sm font-bold tabular-nums mt-1" style={{ color: "var(--color-danger)" }}>
                LKR {po.return_amount.toFixed(2)}
              </dd>
            </div>
          )}

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Created</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              {po.created_at.slice(0, 10)}
            </dd>
          </div>

          {po.approved_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Approved</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                {po.approved_at.slice(0, 10)}
              </dd>
            </div>
          )}

          {po.notes && (
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Notes</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{po.notes}</dd>
            </div>
          )}
        </dl>

        {/* ── Order Items ───────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
            Order Items ({po.items.length})
          </h3>
          <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  {["Product", "SKU", "Qty", "Free", "Disc.", "Unit Price", "Line Total"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {po.items.map((item, idx) => (
                  <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>{item.product_name}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{item.sku || "—"}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.unit_quantity}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.free_quantity ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{(item.discount ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.unit_price.toFixed(2)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>{(item.line_total ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                  <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Order Total</td>
                  <td className="px-3 py-2 tabular-nums font-bold text-sm" style={{ color: "var(--color-text)" }}>
                    {po.total_amount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Return Items ─────────────────────────────────────────────────── */}
        {(po.return_items ?? []).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
              Return Items ({po.return_items.length})
            </h3>
            <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {["Product", "SKU", "Qty", "Free", "Unit Price", "Line Total"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {po.return_items.map((item, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>{item.product_name}</td>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{item.sku || "—"}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.unit_quantity}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.free_quantity ?? 0}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.unit_price.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-danger)" }}>{(item.line_total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                    <td colSpan={5} className="px-3 py-2 text-right text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Return Total</td>
                    <td className="px-3 py-2 tabular-nums font-bold text-sm" style={{ color: "var(--color-danger)" }}>
                      {po.return_amount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
