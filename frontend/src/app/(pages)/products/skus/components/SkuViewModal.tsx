"use client";

import { Modal }       from "@/components/ui/Modal";
import { Badge }       from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SKU_TYPE_VARIANT } from "@/lib/badges";
import { formatDateTime } from "@/lib/utils";
import type { ProductSku } from "@/types";

interface SkuViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  sku:     ProductSku | null;
}

export function SkuViewModal({ isOpen, onClose, sku }: SkuViewModalProps) {
  if (!sku) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SKU Details" size="md">
      <dl className="space-y-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            SKU Name
          </dt>
          <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
            {sku.name}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Plural
          </dt>
          <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
            {sku.plural || "—"}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            SKU Type
          </dt>
          <dd className="mt-1">
            <Badge variant={SKU_TYPE_VARIANT[sku.sku_type]}>
              {sku.sku_type.charAt(0) + sku.sku_type.slice(1).toLowerCase()}
            </Badge>
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Status
          </dt>
          <dd className="mt-1">
            <StatusBadge status={sku.is_active ? "ACTIVE" : "INACTIVE"} />
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Activity</span>
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
        </div>
        <div className="rounded-xl px-4 py-3 space-y-3" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Created by</p>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {sku.created_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
              </p>
            </div>
            <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
              {sku.created_at ? formatDateTime(sku.created_at) : "—"}
            </p>
          </div>
          <div className="h-px" style={{ background: "var(--color-border)" }} />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Last updated by</p>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {sku.updated_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
              </p>
            </div>
            <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
              {sku.updated_at ? formatDateTime(sku.updated_at) : "—"}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
