"use client";

import { Modal }       from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getStaffDisplayName, formatDateTime } from "@/lib/utils";
import type { Staff }  from "@/types";

interface StaffViewModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  staff:       Staff | null;
  branchName?: string;
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

function EmptyValue() {
  return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
}

function ActivityRow({
  label,
  actor,
  timestamp,
}: {
  label:     string;
  actor?:    string;
  timestamp: string | null | undefined;
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
        {timestamp ? formatDateTime(timestamp) : "—"}
      </p>
    </div>
  );
}

export function StaffViewModal({ isOpen, onClose, staff, branchName }: StaffViewModalProps) {
  if (!staff) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Staff Details"
      size="md"
      headerExtra={<StatusBadge status={staff.is_active ? "ACTIVE" : "INACTIVE"} />}
    >
      <div className="space-y-5">

        {/* Identity card */}
        <div
          className="flex items-center gap-4 p-4 rounded-xl"
          style={{ background: "var(--color-surface-2)" }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
            style={{ background: "#008080" }}
          >
            {staff.first_name.charAt(0).toUpperCase()}{staff.last_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>
              {getStaffDisplayName(staff)}
            </p>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {staff.role}
            </p>
            {branchName && (
              <p className="text-xs mt-1 font-medium" style={{ color: "var(--color-text-muted)" }}>
                {branchName}
              </p>
            )}
          </div>
        </div>

        {/* Fields — flat, no sections */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name">{staff.first_name}</Field>
          <Field label="Last Name">{staff.last_name}</Field>
          <Field label="Title">{staff.title || <EmptyValue />}</Field>
          <Field label="Job Title">{staff.role}</Field>
          <Field label="Mobile 1">{staff.mobile_1 || <EmptyValue />}</Field>
          <Field label="Mobile 2">{staff.mobile_2 || <EmptyValue />}</Field>
          <Field label="Landline">{staff.landline || <EmptyValue />}</Field>
          <Field label="WhatsApp">{staff.whatsapp_number || <EmptyValue />}</Field>
          <Field label="EPF No">{staff.epf_no || <EmptyValue />}</Field>
          <Field label="ID Number">{staff.id_number || <EmptyValue />}</Field>
          <Field label="Email">
            {staff.email
              ? <span className="break-all">{staff.email}</span>
              : <EmptyValue />}
          </Field>
        </div>

        {/* Address — full width if present */}
        {staff.address && (
          <Field label="Address">
            <p className="whitespace-pre-wrap">{staff.address}</p>
          </Field>
        )}

        {/* Activity */}
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
            <ActivityRow label="Created by"      actor={staff.created_by_name} timestamp={staff.created_at} />
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <ActivityRow label="Last updated by" actor={staff.updated_by_name} timestamp={staff.updated_at} />
          </div>
        </div>

      </div>
    </Modal>
  );
}
