"use client";

import { Modal }         from "@/components/ui/Modal";
import { StatusBadge }   from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { Branch }   from "@/types";

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

export function BranchViewModal({ isOpen, onClose, branch }: BranchViewModalProps) {
  if (!branch) return null;

  const statusAsEnum = branch.is_active ? "ACTIVE" : "INACTIVE";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Branch Details"
      size="md"
      headerExtra={<StatusBadge status={statusAsEnum} />}
    >
      <div className="space-y-5">

        {/* Identity */}
        <div
          className="p-4 rounded-xl"
          style={{ background: "var(--color-surface-2)" }}
        >
          <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>
            {branch.name}
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {branch.address}
          </p>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone">
            {branch.phone}
          </Field>

          <Field label="License No.">
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
            >
              {branch.license_number}
            </span>
          </Field>

          <Field label="Staff Count">
            {branch.assigned_staff_ids.length}
          </Field>
        </div>

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
              actor={branch.created_by_name}
              timestamp={formatDateTime(branch.created_at)}
            />
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <ActivityRow
              label="Last updated by"
              actor={branch.updated_by_name}
              timestamp={formatDateTime(branch.updated_at)}
            />
          </div>
        </div>

      </div>
    </Modal>
  );
}
