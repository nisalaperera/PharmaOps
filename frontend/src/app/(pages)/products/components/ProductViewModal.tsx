"use client";

import { Modal }   from "@/components/ui/Modal";
import { Badge }   from "@/components/ui/Badge";
import { getActiveStatusVariant } from "@/lib/badges";
import { formatDateTime }         from "@/lib/utils";
import type { Product }           from "@/types";

interface ProductViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  product:  Product | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <div className="text-sm" style={{ color: "var(--color-text)" }}>
        {children}
      </div>
    </div>
  );
}

function Empty() {
  return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

export function ProductViewModal({ isOpen, onClose, product }: ProductViewModalProps) {
  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Product Details"
      size="xl"
      headerExtra={
        <Badge variant={getActiveStatusVariant(product.is_active)}>
          {product.is_active ? "Active" : "Inactive"}
        </Badge>
      }
    >
      <div className="space-y-5">

        {/* Product name */}
        <div className="px-4 py-3 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
          <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>
            {product.name}
          </p>
          {product.barcode && (
            <p className="text-xs mt-1 font-mono" style={{ color: "var(--color-text-muted)" }}>
              Barcode: {product.barcode}
            </p>
          )}
        </div>

        {/* Classification */}
        <SectionHeader title="Classification" />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Generic">
            {product.generic_name || <Empty />}
          </Field>
          <Field label="Brand">
            {product.brand_name || <Empty />}
          </Field>
          <Field label="Category">
            {product.category_name || <Empty />}
          </Field>
          <Field label="Basic SKU">
            {product.basic_sku_name || <Empty />}
          </Field>
        </div>

        {/* Specific instructions */}
        {product.specific_instructions && (
          <>
            <SectionHeader title="Specific Instructions" />
            <p className="text-sm" style={{ color: "var(--color-text)" }}>
              {product.specific_instructions}
            </p>
          </>
        )}

        {/* SKU Mappings */}
        {product.sku_mappings.length > 0 && (
          <>
            <SectionHeader title={`Other SKU Mappings (${product.sku_mappings.length})`} />
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Mapped To</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Basic Count</th>
                </tr>
              </thead>
              <tbody>
                {product.sku_mappings.map((mapping, index) => (
                  <tr key={index}>
                    <td>
                      <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                        {mapping.sku}
                      </span>
                    </td>
                    <td className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {mapping.mapped_sku === "basic"
                        ? `${product.basic_sku_name} (Basic)`
                        : mapping.mapped_sku}
                    </td>
                    <td className="text-sm text-right font-mono">{mapping.mapped_sku_count}</td>
                    <td className="text-sm text-right font-mono">{mapping.basic_sku_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Activity */}
        <SectionHeader title="Activity" />

        <div
          className="rounded-xl px-4 py-3 grid grid-cols-2 gap-4"
          style={{ background: "var(--color-surface-2)" }}
        >
          <Field label="Created At">
            <span className="font-mono text-xs">{formatDateTime(product.created_at)}</span>
          </Field>
          <Field label="Last Modified At">
            <span className="font-mono text-xs">{formatDateTime(product.last_modified_at)}</span>
          </Field>
          <Field label="Created By">
            {product.created_by_name || <Empty />}
          </Field>
          <Field label="Last Modified By">
            {product.last_modified_by_name || <Empty />}
          </Field>
        </div>

      </div>
    </Modal>
  );
}
