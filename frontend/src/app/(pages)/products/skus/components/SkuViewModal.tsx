"use client";

import { Modal }       from "@/components/ui/Modal";
import { Badge }       from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SKU_TYPE_VARIANT } from "@/lib/badges";
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
    </Modal>
  );
}
