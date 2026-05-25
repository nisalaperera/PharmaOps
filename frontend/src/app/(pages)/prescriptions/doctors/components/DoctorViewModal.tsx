"use client";

import { Modal }       from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { Doctor } from "@/types";

interface DoctorViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  doctor:  Doctor | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <div className="text-sm" style={{ color: "var(--color-text)" }}>{children}</div>
    </div>
  );
}

export function DoctorViewModal({ isOpen, onClose, doctor }: DoctorViewModalProps) {
  if (!doctor) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Doctor Details" size="md"
           headerExtra={<StatusBadge status={doctor.is_active ? "ACTIVE" : "INACTIVE"} />}>
      <div className="space-y-5">
        <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
               style={{ background: "#008080" }}>
            {doctor.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>{doctor.name}</p>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>{doctor.specialization}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full Name">{doctor.name}</Field>
          <Field label="Specialization">{doctor.specialization}</Field>
          <Field label="Hospital / Clinic">{doctor.hospital_or_clinic}</Field>
          <Field label="License Number">{doctor.license_number}</Field>
          <Field label="Phone">{doctor.phone}</Field>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Activity</span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>
          <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: "var(--color-surface-2)" }}>
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Created</p>
              <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{formatDateTime(doctor.created_at)}</p>
            </div>
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Last updated</p>
              <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{doctor.updated_at ? formatDateTime(doctor.updated_at) : "—"}</p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
