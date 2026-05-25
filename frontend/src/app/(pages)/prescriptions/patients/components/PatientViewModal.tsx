"use client";

import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge }  from "@/components/ui/Badge";
import { X, Pencil } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { getActiveStatusVariant } from "@/lib/badges";
import type { Patient } from "@/types";

interface PatientViewModalProps {
  patient: Patient | null;
  isOpen:  boolean;
  onClose: () => void;
  onEdit:  () => void;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{value ?? "—"}</p>
    </div>
  );
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  SELF: "Self", SPOUSE: "Spouse", CHILD: "Child",
  PARENT: "Parent", SIBLING: "Sibling", OTHER: "Other",
};

export function PatientViewModal({ patient, isOpen, onClose, onEdit }: PatientViewModalProps) {
  if (!patient) return null;

  const initials = patient.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Patient Details"
      size="sm"
      headerExtra={
        <Badge variant={getActiveStatusVariant(patient.is_active)} dot>
          {patient.is_active ? "Active" : "Inactive"}
        </Badge>
      }
    >
      <div className="space-y-5">

        {/* Identity */}
        <div className="flex items-center gap-4 rounded-xl px-4 py-3" style={{ background: "var(--color-surface-2)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-lg"
               style={{ background: "var(--color-primary)" }}>
            {initials}
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>{patient.name}</p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {RELATIONSHIP_LABEL[patient.relationship] ?? patient.relationship} of {patient.customer_name}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Customer"     value={patient.customer_name} />
          <Field label="Relationship" value={RELATIONSHIP_LABEL[patient.relationship] ?? patient.relationship} />
          <Field label="Date of Birth" value={patient.date_of_birth} />
        </div>

        <div className="border-t pt-3 grid grid-cols-2 gap-3 text-xs" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
          <div><span className="font-medium">Created: </span>{formatDateTime(patient.created_at)}</div>
          <div><span className="font-medium">Updated: </span>{formatDateTime(patient.updated_at)}</div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} leftIcon={<X className="w-4 h-4" />}>Close</Button>
          <Button variant="primary" onClick={onEdit} leftIcon={<Pencil className="w-4 h-4" />}>Edit</Button>
        </div>

      </div>
    </Modal>
  );
}
