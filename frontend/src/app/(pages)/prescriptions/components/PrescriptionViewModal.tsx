"use client";

import { Modal }  from "@/components/ui/Modal";
import { Badge }  from "@/components/ui/Badge";
import { daysUntilExpiry, formatDateTime } from "@/lib/utils";
import type { Prescription } from "@/types";

interface PrescriptionViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  prescription:  Prescription | null;
  branchNameMap: Record<string, string>;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

function ExpiryLabel({ expiryDate }: { expiryDate: string }) {
  const days = daysUntilExpiry(expiryDate);
  if (days <= 0) {
    return (
      <span>
        {expiryDate}{" "}
        <span className="text-xs font-medium text-danger-500">(Expired)</span>
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span>
        {expiryDate}{" "}
        <span className="text-xs font-medium text-amber-500">({days}d left)</span>
      </span>
    );
  }
  return <span>{expiryDate}</span>;
}

export function PrescriptionViewModal({
  isOpen,
  onClose,
  prescription,
  branchNameMap,
}: PrescriptionViewModalProps) {
  if (!prescription) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Prescription Details"
      size="lg"
      headerExtra={
        <Badge variant={prescription.is_active ? "success" : "default"}>
          {prescription.is_active ? "Active" : "Inactive"}
        </Badge>
      }
    >
      <div className="space-y-5">

        {/* ── Summary ───────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Patient
            </dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {prescription.patient_name || "—"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Doctor
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {prescription.doctor_name || "—"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Branch
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {branchNameMap[prescription.branch_id] ?? prescription.branch_id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Usage Count
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {prescription.usage_count}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Prescription Date
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {prescription.prescription_date}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Expiry Date
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              <ExpiryLabel expiryDate={prescription.expiry_date} />
            </dd>
          </div>
        </dl>

        {/* ── Items ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <SectionDivider label={`Items (${prescription.items.length})`} />

          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                    Product
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                    Dosage
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                    Frequency
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                    Duration
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {prescription.items.map((item, idx) => (
                  <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text)" }}>
                      {item.product_name || item.product_id}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>
                      {item.dosage}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>
                      {item.frequency}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>
                      {item.duration}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                      {item.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <SectionDivider label="Activity" />
          <div
            className="rounded-xl px-4 py-3"
            style={{ background: "var(--color-surface-2)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Created</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>—</p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {prescription.created_at ? formatDateTime(prescription.created_at) : "—"}
              </p>
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
}
