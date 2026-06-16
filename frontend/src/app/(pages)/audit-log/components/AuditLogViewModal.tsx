"use client";

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { cn, formatDateTime, getRoleLabel } from "@/lib/utils";
import { getRoleBadgeColor, AUDIT_ACTION_VARIANT } from "@/lib/badges";
import type { AuditLog } from "@/types";

interface AuditLogViewModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  auditLog: AuditLog | null;
}

export function AuditLogViewModal({ isOpen, onClose, auditLog }: AuditLogViewModalProps) {
  if (!auditLog) return null;

  const hasDetails = auditLog.details && Object.keys(auditLog.details).length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Audit Log Details">
      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Timestamp</dt>
          <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
            {formatDateTime(auditLog.timestamp)}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>User</dt>
          <dd className="text-sm mt-0.5 flex items-center gap-2" style={{ color: "var(--color-text)" }}>
            {auditLog.user_email}
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", getRoleBadgeColor(auditLog.user_role))}>
              {getRoleLabel(auditLog.user_role)}
            </span>
          </dd>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Action</dt>
            <dd className="mt-0.5">
              <Badge variant={AUDIT_ACTION_VARIANT[auditLog.action] ?? "default"}>{auditLog.action}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Module</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{auditLog.resource}</dd>
          </div>
        </div>

        {auditLog.resource_id && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Record ID</dt>
            <dd className="text-sm mt-0.5 font-mono break-all" style={{ color: "var(--color-text)" }}>
              {auditLog.resource_id}
            </dd>
          </div>
        )}

        {auditLog.branch_id && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Branch ID</dt>
            <dd className="text-sm mt-0.5 font-mono break-all" style={{ color: "var(--color-text)" }}>
              {auditLog.branch_id}
            </dd>
          </div>
        )}

        {auditLog.ip_address && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>IP Address</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{auditLog.ip_address}</dd>
          </div>
        )}

        {hasDetails && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Details</dt>
            <dd className="mt-1">
              <pre
                className="text-xs rounded-lg p-3 overflow-x-auto max-h-64"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
              >
                {JSON.stringify(auditLog.details, null, 2)}
              </pre>
            </dd>
          </div>
        )}
      </dl>
    </Modal>
  );
}
