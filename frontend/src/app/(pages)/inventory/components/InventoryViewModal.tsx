"use client";

import { Modal }   from "@/components/ui/Modal";
import { Badge }   from "@/components/ui/Badge";
import { daysUntilExpiry } from "@/lib/utils";
import type { InventoryItem } from "@/types";

interface InventoryViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  item:          InventoryItem | null;
  branchNameMap: Record<string, string>;
}

export function InventoryViewModal({
  isOpen, onClose, item, branchNameMap,
}: InventoryViewModalProps) {
  if (!item) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inventory Details" size="xl">
      <div className="space-y-6">

        {/* Summary */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Product
            </dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {item.product_name}
            </dd>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Branch
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {branchNameMap[item.branch_id] ?? item.branch_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Total Quantity
            </dt>
            <dd className="text-sm font-semibold mt-1 tabular-nums" style={{ color: "var(--color-text)" }}>
              {item.total_quantity.toLocaleString()}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Min Stock Level
            </dt>
            <dd className="text-sm mt-1 tabular-nums" style={{ color: "var(--color-text)" }}>
              {item.min_stock_level.toLocaleString()}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Stock Status
            </dt>
            <dd className="mt-1">
              {item.is_low_stock
                ? <Badge variant="danger">Low Stock</Badge>
                : <Badge variant="success">In Stock</Badge>
              }
            </dd>
          </div>

          {item.updated_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Last Updated
              </dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
                {item.updated_at.slice(0, 10)}
              </dd>
            </div>
          )}
        </dl>

        {/* Batch table */}
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
            Batches {item.batches.length > 0 && `(${item.batches.length})`}
          </h3>

          {item.batches.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--color-text-muted)" }}>
              No batches recorded for this item.
            </p>
          ) : (
            <div
              className="rounded-lg overflow-auto border"
              style={{ borderColor: "var(--color-border)" }}
            >
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {["Batch #", "Expiry", "Qty", "Purchase", "Selling", "Supplier", "Received"].map((h) => (
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
                  {item.batches.map((batch, idx) => {
                    const days       = daysUntilExpiry(batch.expiry_date);
                    const isExpired  = days < 0;
                    const isExpiring = !isExpired && days <= 90;

                    return (
                      <tr
                        key={idx}
                        className="border-t"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text)" }}>
                          {batch.batch_number}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              isExpired  ? "font-semibold text-danger-500" :
                              isExpiring ? "font-semibold text-amber-500"  : ""
                            }
                            style={!isExpired && !isExpiring ? { color: "var(--color-text-muted)" } : undefined}
                          >
                            {batch.expiry_date}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text)" }}>
                          {batch.quantity.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                          {batch.purchase_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                          {batch.selling_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>
                          {batch.supplier_name || "—"}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>
                          {batch.received_date}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
