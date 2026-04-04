"use client";

import { Modal }                            from "@/components/ui/Modal";
import { StatusBadge }                      from "@/components/ui/StatusBadge";
import { getRoleBadgeColor }                from "@/lib/badges";
import { getRoleLabel, formatDateTime, cn } from "@/lib/utils";
import type { User }                        from "@/types";

interface UserViewModalProps {
  isOpen:  boolean;
  onClose: () => void;
  user:    User | null;
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

export function UserViewModal({ isOpen, onClose, user }: UserViewModalProps) {
  if (!user) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="User Details"
      size="md"
      headerExtra={<StatusBadge status={user.status} />}
    >
      <div className="space-y-5">

        {/* Identity */}
        <div
          className="flex items-center gap-4 p-4 rounded-xl"
          style={{ background: "var(--color-surface-2)" }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
            style={{ background: "#008080" }}
          >
            {user.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>
              {user.full_name}
            </p>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {user.email}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role">
            <span
              className={cn(
                "inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full",
                getRoleBadgeColor(user.role)
              )}
            >
              {getRoleLabel(user.role)}
            </span>
          </Field>

          <Field label="Phone">
            {user.phone ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
          </Field>

          <Field label="Last Login">
            {user.last_login_at
              ? formatDateTime(user.last_login_at)
              : <span style={{ color: "var(--color-text-muted)" }}>Never</span>}
          </Field>
        </div>

        {/* Activity section */}
        <div>
          <div
            className="flex items-center gap-2 mb-3"
          >
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
              actor={user.created_by_name}
              timestamp={formatDateTime(user.created_at)}
            />
            <div className="h-px" style={{ background: "var(--color-border)" }} />
            <ActivityRow
              label="Last updated by"
              actor={user.updated_by_name}
              timestamp={formatDateTime(user.updated_at)}
            />
          </div>
        </div>

      </div>
    </Modal>
  );
}
