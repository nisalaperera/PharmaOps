"use client";

import { Modal }       from "@/components/ui/Modal";
import { Badge }       from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, formatAmount } from "@/lib/utils";
import type { ProductCategory } from "@/types";

interface CategoryViewModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  category:  ProductCategory | null;
}

export function CategoryViewModal({ isOpen, onClose, category }: CategoryViewModalProps) {
  if (!category) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Category Details" size="md"
      headerExtra={<StatusBadge status={category.is_active ? "ACTIVE" : "INACTIVE"} />}>
      <div className="space-y-5">
        <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>{category.name}</p>
            {category.colour && (
              <span className="w-4 h-4 rounded-full border flex-shrink-0"
                style={{ backgroundColor: category.colour, borderColor: "var(--color-border)" }} />
            )}
          </div>
          {category.path && (
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{category.path} &gt; {category.name}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Parent Category</p>
            <p className="text-sm" style={{ color: "var(--color-text)" }}>
              {category.parent_name || <span style={{ color: "var(--color-text-muted)" }}>— Top Level —</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Level</p>
            <p className="text-sm" style={{ color: "var(--color-text)" }}>{category.level ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Default Margin</p>
            <p className="text-sm" style={{ color: "var(--color-text)" }}>
              {category.default_margin_percentage != null ? (
                <span className="font-semibold">{formatAmount(category.default_margin_percentage)}%</span>
              ) : (
                <span style={{ color: "var(--color-text-muted)" }}>— Not Set —</span>
              )}
            </p>
            {category.effective_margin_percentage != null && category.default_margin_percentage == null && (
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Inherited: {formatAmount(category.effective_margin_percentage)}%
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Effective Margin</p>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {category.effective_margin_percentage != null
                ? `${formatAmount(category.effective_margin_percentage)}%`
                : <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>— None —</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Discount Applicable</p>
            <Badge variant={category.is_discount_applicable ? "success" : "default"}>
              {category.is_discount_applicable ? "Yes" : "No"}
            </Badge>
          </div>
          {category.icon && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>Icon</p>
              <p className="text-sm" style={{ color: "var(--color-text)" }}>{category.icon}</p>
            </div>
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
                  {category.created_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                </p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {category.created_at ? formatDateTime(category.created_at) : "—"}
              </p>
            </div>
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Last updated by</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {category.updated_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                </p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {category.updated_at ? formatDateTime(category.updated_at) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
