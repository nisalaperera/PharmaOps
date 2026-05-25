"use client";

import { Modal } from "@/components/ui/Modal";
import type { ProductGeneric } from "@/types";

interface GenericViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  generic:  ProductGeneric | null;
}

export function GenericViewModal({ isOpen, onClose, generic }: GenericViewModalProps) {
  if (!generic) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generic Details" size="md">
      <dl className="space-y-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Generic Name
          </dt>
          <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
            {generic.name}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Description
          </dt>
          <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
            {generic.description || "—"}
          </dd>
        </div>
      </dl>
    </Modal>
  );
}
