"use client";

import { Modal }       from "@/components/ui/Modal";
import { Badge }       from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { ProductGeneric } from "@/types";

interface GenericViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  generic:  ProductGeneric | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <div className="text-sm" style={{ color: "var(--color-text)" }}>{children}</div>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items.length) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t, i) => (
        <span key={i} className="text-xs px-2 py-0.5 rounded-md"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>{t}</span>
      ))}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

export function GenericViewModal({ isOpen, onClose, generic }: GenericViewModalProps) {
  if (!generic) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generic Details" size="lg"
      headerExtra={<StatusBadge status={generic.is_active ? "ACTIVE" : "INACTIVE"} />}>
      <div className="space-y-5">

        <div className="p-4 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
          <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>{generic.name}</p>
          {generic.description && (
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{generic.description}</p>
          )}
        </div>

        <SectionHeader label="Classification" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Dosage Form">
            {generic.dosage_form ? generic.dosage_form.charAt(0) + generic.dosage_form.slice(1).toLowerCase() : "—"}
          </Field>
          <Field label="Requires Prescription">
            <Badge variant={generic.requires_prescription ? "warning" : "default"}>
              {generic.requires_prescription ? "Yes" : "No"}
            </Badge>
          </Field>
          <Field label="Controlled Schedule">
            {generic.controlled_substance_schedule === "NONE" || !generic.controlled_substance_schedule
              ? "None"
              : generic.controlled_substance_schedule.replace("_", " ")}
          </Field>
          {generic.local_license_number && (
            <Field label="License Number">
              <span className="font-mono text-xs px-2 py-0.5 rounded"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                {generic.local_license_number}
              </span>
            </Field>
          )}
        </div>

        {(generic.active_ingredients.length > 0 || generic.drug_interactions.length > 0 || generic.side_effects.length > 0) && (
          <>
            <SectionHeader label="Clinical" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {generic.active_ingredients.length > 0 && (
                <Field label="Active Ingredients"><TagList items={generic.active_ingredients} /></Field>
              )}
              {generic.drug_interactions.length > 0 && (
                <Field label="Drug Interactions"><TagList items={generic.drug_interactions} /></Field>
              )}
            </div>
            {generic.side_effects.length > 0 && (
              <Field label="Side Effects"><TagList items={generic.side_effects} /></Field>
            )}
          </>
        )}

        {(generic.storage_conditions.length > 0 || generic.special_instructions.length > 0 || generic.dosage_instructions.length > 0) && (
          <>
            <SectionHeader label="Instructions" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Storage Conditions"><TagList items={generic.storage_conditions} /></Field>
              <Field label="Special Instructions"><TagList items={generic.special_instructions} /></Field>
              <Field label="Dosage Instructions"><TagList items={generic.dosage_instructions} /></Field>
            </div>
          </>
        )}

        {generic.stock_location_name && (
          <>
            <SectionHeader label="Storage" />
            <Field label="Default Stock Location">{generic.stock_location_name}</Field>
          </>
        )}

        <SectionHeader label="Activity" />
        <div className="rounded-xl px-4 py-3 space-y-3" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Created by</p>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {generic.created_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
              </p>
            </div>
            <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
              {generic.created_at ? formatDateTime(generic.created_at) : "—"}
            </p>
          </div>
          <div className="h-px" style={{ background: "var(--color-border)" }} />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Last updated by</p>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {generic.updated_by_id ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
              </p>
            </div>
            <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
              {generic.updated_at ? formatDateTime(generic.updated_at) : "—"}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
