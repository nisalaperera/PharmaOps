"use client";

import { Modal }       from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { StockLocation } from "@/types";

interface StockLocationViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  location: StockLocation | null;
}

export function StockLocationViewModal({ isOpen, onClose, location }: StockLocationViewModalProps) {
  if (!location) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Location Details"
      size="md"
      headerExtra={<StatusBadge status={location.is_active ? "ACTIVE" : "INACTIVE"} />}
    >
      <div className="space-y-5">
        <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>{location.name}</p>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
              {location.code}
            </span>
          </div>
          {location.description && (
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{location.description}</p>
          )}
        </div>

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
                  {location.created_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                </p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {location.created_at ? formatDateTime(location.created_at) : "—"}
              </p>
            </div>
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Last updated by</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {location.updated_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                </p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {location.updated_at ? formatDateTime(location.updated_at) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
