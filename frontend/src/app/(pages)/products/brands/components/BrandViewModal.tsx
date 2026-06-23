"use client";

import { Modal }       from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { ProductBrand } from "@/types";

interface BrandViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  brand:   ProductBrand | null;
}

export function BrandViewModal({ isOpen, onClose, brand }: BrandViewModalProps) {
  if (!brand) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Brand Details" size="md"
      headerExtra={<StatusBadge status={brand.is_active ? "ACTIVE" : "INACTIVE"} />}>
      <div className="space-y-5">
        <dl className="space-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Brand Name</dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>{brand.name}</dd>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Manufacturer</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{brand.manufacturer_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Country</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{brand.country || "—"}</dd>
            </div>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Return Expiry Before</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {brand.return_expiry_before != null ? `${brand.return_expiry_before} days` : "—"}
            </dd>
          </div>
        </dl>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Activity</span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>
          <div className="rounded-xl px-4 py-3 space-y-3" style={{ background: "var(--color-surface-2)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Created by</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {brand.created_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                </p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {brand.created_at ? formatDateTime(brand.created_at) : "—"}
              </p>
            </div>
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Last updated by</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {brand.updated_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                </p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {brand.updated_at ? formatDateTime(brand.updated_at) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
