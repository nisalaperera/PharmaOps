"use client";

import { Modal }        from "@/components/ui/Modal";
import { Badge }        from "@/components/ui/Badge";
import { formatTime, formatDateTime } from "@/lib/utils";
import { ATTENDANCE_STATUS_VARIANT }  from "@/lib/badges";
import type { Attendance }            from "@/types";

function calcDuration(clockIn: string | null | undefined, clockOut: string | null | undefined): string {
  if (!clockIn || !clockOut) return "—";
  const [inH,  inM]  = clockIn.split(":").map(Number);
  const [outH, outM] = clockOut.split(":").map(Number);
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return "—";
  const diff = (outH * 60 + outM) - (inH * 60 + inM);
  if (diff <= 0) return "—";
  const hours   = Math.floor(diff / 60);
  const minutes = diff % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0)                 return `${hours}h`;
  return `${minutes}m`;
}

interface AttendanceViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  record:  Attendance | null;
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

export function AttendanceViewModal({ isOpen, onClose, record }: AttendanceViewModalProps) {
  if (!record) return null;

  const statusVariant = ATTENDANCE_STATUS_VARIANT[record.status];
  const statusLabel   = record.status.replace("_", " ");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Attendance Details"
      size="md"
      headerExtra={
        <Badge variant={statusVariant}>
          {statusLabel.charAt(0) + statusLabel.slice(1).toLowerCase()}
        </Badge>
      }
    >
      <div className="space-y-5">

        {/* Staff card */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: "var(--color-surface-2)" }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: "#008080" }}
          >
            {record.staff_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold" style={{ color: "var(--color-text)" }}>
              {record.staff_name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {record.date}
            </p>
          </div>
        </div>

        {/* Timing */}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Clock In">
            {record.clock_in ? formatTime(record.clock_in) : <Empty />}
          </Field>
          <Field label="Clock Out">
            {record.clock_out ? formatTime(record.clock_out) : <Empty />}
          </Field>
          <Field label="Duration">
            {calcDuration(record.clock_in, record.clock_out)}
          </Field>
        </div>

        {/* Notes */}
        {record.notes && (
          <Field label="Notes">
            <p className="whitespace-pre-wrap">{record.notes}</p>
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
            <ActivityRow
              label="Recorded by"
              actor={record.created_by_name}
              timestamp={record.created_at}
            />
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <ActivityRow
              label="Last updated by"
              actor={record.updated_by_name}
              timestamp={record.updated_at}
            />
          </div>
        </div>

      </div>
    </Modal>
  );
}
