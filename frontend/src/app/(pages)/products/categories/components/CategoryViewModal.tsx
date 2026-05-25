"use client";

import { Modal } from "@/components/ui/Modal";
import type { ProductCategory } from "@/types";

interface CategoryViewModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  category:  ProductCategory | null;
}

export function CategoryViewModal({ isOpen, onClose, category }: CategoryViewModalProps) {
  if (!category) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Category Details" size="md">
      <dl className="space-y-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Category Name
          </dt>
          <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
            {category.name}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Parent Category
          </dt>
          <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
            {category.parent_name || <span style={{ color: "var(--color-text-muted)" }}>— Top Level —</span>}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Description
          </dt>
          <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
            {category.description || "—"}
          </dd>
        </div>
      </dl>
    </Modal>
  );
}
