"use client";

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { DEDUCTION_TYPE_OPTIONS, MONTH_OPTIONS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { Payroll } from "@/types";

interface PayrollViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  payroll:       Payroll | null;
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

export function PayrollViewModal({ isOpen, onClose, payroll, branchNameMap }: PayrollViewModalProps) {
  if (!payroll) return null;

  const periodLabel = `${MONTH_OPTIONS.find((m) => m.value === payroll.month)?.label ?? payroll.month} ${payroll.year}`;

  const deductionLabel = (type: string) =>
    DEDUCTION_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payroll Details"
      size="md"
      headerExtra={
        <Badge variant={payroll.is_paid ? "success" : "warning"}>
          {payroll.is_paid ? "Paid" : "Unpaid"}
        </Badge>
      }
    >
      <div className="space-y-5">

        {/* ── Summary ──────────────────────────────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Staff Member
            </dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {payroll.staff_name}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Period
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {periodLabel}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Branch
            </dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>
              {branchNameMap[payroll.branch_id] ?? payroll.branch_id}
            </dd>
          </div>

          {payroll.is_paid && payroll.paid_at && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Paid At
              </dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                {payroll.paid_at.slice(0, 10)}
              </dd>
            </div>
          )}
        </dl>

        {/* ── Salary breakdown ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <SectionDivider label="Salary Breakdown" />

          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>Basic Salary</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                    {payroll.basic_salary.toFixed(2)}
                  </td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>Overtime Pay</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                    {payroll.overtime_pay.toFixed(2)}
                  </td>
                </tr>
                <tr
                  className="border-t font-medium"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
                >
                  <td className="px-4 py-2.5" style={{ color: "var(--color-text)" }}>Gross Salary</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                    {payroll.gross_salary.toFixed(2)}
                  </td>
                </tr>

                {payroll.deductions.map((d, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="px-4 py-2.5 text-danger-500">
                      − {deductionLabel(d.type)}{d.description ? ` (${d.description})` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-danger-500">
                      {d.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}

                <tr
                  className="border-t font-semibold"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
                >
                  <td className="px-4 py-3 text-base" style={{ color: "var(--color-text)" }}>Net Salary</td>
                  <td className="px-4 py-3 text-right tabular-nums text-base" style={{ color: "var(--color-text)" }}>
                    {payroll.net_salary.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <SectionDivider label="Activity" />
          <div
            className="rounded-xl px-4 py-3 space-y-3"
            style={{ background: "var(--color-surface-2)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Generated</p>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>—</p>
              </div>
              <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                {formatDateTime(payroll.created_at)}
              </p>
            </div>
            {payroll.is_paid && payroll.paid_at && (
              <>
                <div className="h-px" style={{ background: "var(--color-border)" }} />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Marked as Paid</p>
                    <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>—</p>
                  </div>
                  <p className="text-xs mt-5 flex-shrink-0 font-mono" style={{ color: "var(--color-text-muted)" }}>
                    {formatDateTime(payroll.paid_at)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}
