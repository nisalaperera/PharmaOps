"use client";

import { Modal }         from "@/components/ui/Modal";
import { Badge }         from "@/components/ui/Badge";
import { StatusBadge }   from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { Branch, EntityContact } from "@/types";

interface BranchViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  branch:  Branch | null;
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

function ActivityRow({
  label,
  actor,
  timestamp,
}: {
  label:     string;
  actor?:    string;
  timestamp: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </p>
        <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
          {actor ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
        </p>
      </div>
      <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
        {timestamp}
      </p>
    </div>
  );
}

function ContactsTable({ contacts }: { contacts: EntityContact[] }) {
  if (contacts.length === 0) {
    return <p className="text-xs py-2" style={{ color: "var(--color-text-muted)" }}>No contacts.</p>;
  }
  return (
    <div className="rounded-lg overflow-auto border mt-2" style={{ borderColor: "var(--color-border)" }}>
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr style={{ background: "var(--color-surface-2)" }}>
            {["Label", "Name", "Mobile 1", "Email", "Status"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, idx) => (
            <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>
                {c.identifier}
              </td>
              <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>
                {c.title} {c.first_name} {c.last_name}
              </td>
              <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {c.mobile_1}
              </td>
              <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>
                {c.email || "—"}
              </td>
              <td className="px-3 py-2">
                <Badge variant={c.is_active ? "success" : "default"}>
                  {c.is_active ? "Active" : "Inactive"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BranchViewModal({ isOpen, onClose, branch }: BranchViewModalProps) {
  if (!branch) return null;

  const statusAsEnum = branch.is_active ? "ACTIVE" : "INACTIVE";
  const hasContacts  = branch.contacts && branch.contacts.length > 0;
  const hasSettings  = branch.settings && Object.values(branch.settings).some((v) => v !== null && v !== undefined);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Branch Details"
      size="lg"
      headerExtra={<StatusBadge status={statusAsEnum} />}
    >
      <div className="space-y-5">

        {/* Identity */}
        <div
          className="p-4 rounded-xl"
          style={{ background: "var(--color-surface-2)" }}
        >
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>
              {branch.name}
            </p>
            {branch.branch_prefix && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}>
                {branch.branch_prefix}
              </span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {branch.address}
          </p>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="License No.">
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
            >
              {branch.license_number}
            </span>
          </Field>

          <Field label="Staff Count">
            {branch.assigned_staff_ids?.length ?? 0}
          </Field>

          <Field label="Discount Applicable">
            <Badge variant={branch.settings?.is_discount_applicable ? "success" : "default"}>
              {branch.settings?.is_discount_applicable ? "Yes" : "No"}
            </Badge>
          </Field>

          {hasSettings && branch.settings?.currency && (
            <Field label="Currency">
              {branch.settings.currency}
            </Field>
          )}

          {hasSettings && branch.settings?.tax_enabled !== null && branch.settings?.tax_enabled !== undefined && (
            <Field label="Tax Enabled">
              {branch.settings.tax_enabled ? "Yes" : "No"}
            </Field>
          )}
        </div>

        {/* Contacts */}
        {hasContacts && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                Contacts
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
            </div>
            <ContactsTable contacts={branch.contacts} />
          </div>
        )}

        {/* Activity section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              Activity
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>

          <div
            className="rounded-xl px-4 py-3 space-y-3"
            style={{ background: "var(--color-surface-2)" }}
          >
            <ActivityRow
              label="Created by"
              actor={branch.created_by_id}
              timestamp={formatDateTime(branch.created_at)}
            />
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <ActivityRow
              label="Last updated by"
              actor={branch.updated_by_id}
              timestamp={formatDateTime(branch.updated_at)}
            />
          </div>
        </div>

      </div>
    </Modal>
  );
}
