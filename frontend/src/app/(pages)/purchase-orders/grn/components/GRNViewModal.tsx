"use client";

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { GRN_STATUS_VARIANT, GRN_STATUS_LABEL } from "@/lib/badges";
import type { GoodsReceivedNote } from "@/types";

interface GRNViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  grn:           GoodsReceivedNote | null;
  branchNameMap: Record<string, string>;
}

export function GRNViewModal({ isOpen, onClose, grn, branchNameMap }: GRNViewModalProps) {
  if (!grn) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Goods Received Note" size="xl">
      <div className="space-y-6">

        {/* ── Summary ──────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              GRN Number
            </dt>
            <dd className="text-sm font-mono font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              #{grn.id.slice(0, 8).toUpperCase()}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Status
            </dt>
            <dd className="mt-1">
              <Badge variant={GRN_STATUS_VARIANT[grn.status]}>
                {GRN_STATUS_LABEL[grn.status]}
              </Badge>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Purchase Order
            </dt>
            <dd className="text-sm font-mono mt-1" style={{ color: "var(--color-text)" }}>
              #{grn.purchase_order_id.slice(0, 8).toUpperCase()}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Branch
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {branchNameMap[grn.branch_id] ?? grn.branch_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Supplier
            </dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {grn.supplier_name || grn.supplier_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Channel
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {grn.channel_name || grn.channel_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Received At
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              {grn.received_at.slice(0, 10)}
            </dd>
          </div>

          {grn.notes && (
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Notes
              </dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
                {grn.notes}
              </dd>
            </div>
          )}
        </dl>

        {/* ── Items table ───────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
            Items ({grn.items.length})
          </h3>
          <div
            className="rounded-lg overflow-auto border"
            style={{ borderColor: "var(--color-border)" }}
          >
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  {["Product", "Ordered", "Received", "Batch #", "Expiry", "Unit Price"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grn.items.map((item, idx) => {
                  const isPartial = item.received_quantity < item.ordered_quantity;
                  return (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>
                        {item.product_name}
                      </td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                        {item.ordered_quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className={isPartial ? "font-semibold text-amber-500" : ""} style={!isPartial ? { color: "var(--color-text)" } : undefined}>
                          {item.received_quantity.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>
                        {item.batch_number}
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>
                        {item.expiry_date}
                      </td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                        {item.unit_price.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Modal>
  );
}
