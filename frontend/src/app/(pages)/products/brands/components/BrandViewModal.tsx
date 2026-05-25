"use client";

import { Modal } from "@/components/ui/Modal";
import type { ProductBrand } from "@/types";

interface BrandViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  brand:   ProductBrand | null;
}

export function BrandViewModal({ isOpen, onClose, brand }: BrandViewModalProps) {
  if (!brand) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Brand Details" size="md">
      <dl className="space-y-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Brand Name
          </dt>
          <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
            {brand.name}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Manufacturer
          </dt>
          <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
            {brand.manufacturer_name || "—"}
          </dd>
        </div>
      </dl>
    </Modal>
  );
}
