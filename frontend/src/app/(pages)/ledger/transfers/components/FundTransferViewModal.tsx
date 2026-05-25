"use client";

import { Modal }          from "@/components/ui/Modal";
import { Badge }          from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { FUND_SOURCE_TYPE_LABEL } from "@/lib/constants";
import type { FundTransfer } from "@/types";

interface FundTransferViewModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  transfer:  FundTransfer | null;
}

export function FundTransferViewModal({ isOpen, onClose, transfer }: FundTransferViewModalProps) {
  if (!transfer) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fund Transfer Details" size="md">

      {/* Amount — large and prominent */}
      <div
        className="rounded-xl px-5 py-4 mb-5 text-center"
        style={{ background: "var(--color-surface-2)" }}
      >
        <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
          Transfer Amount
        </p>
        <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
          LKR {transfer.amount.toFixed(2)}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
          {transfer.transfer_date}
        </p>
      </div>

      {/* From / To */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div
          className="rounded-xl px-4 py-3 border"
          style={{ borderColor: "var(--color-border)" }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>From</p>
          <Badge variant="info" className="mb-2">
            {FUND_SOURCE_TYPE_LABEL[transfer.from_source_type]}
          </Badge>
          <p className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
            {transfer.from_source_name}
          </p>
        </div>

        <div
          className="rounded-xl px-4 py-3 border"
          style={{ borderColor: "var(--color-border)" }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>To</p>
          <Badge variant="success" className="mb-2">
            {FUND_SOURCE_TYPE_LABEL[transfer.to_source_type]}
          </Badge>
          <p className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>
            {transfer.to_source_name}
          </p>
        </div>
      </div>

      {/* Detail rows */}
      <dl className="space-y-3">
        {transfer.notes && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Notes</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {transfer.notes}
            </dd>
          </div>
        )}

        {transfer.created_by_name && (
          <div>
            <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Created By</dt>
            <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
              {transfer.created_by_name}
            </dd>
          </div>
        )}

        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Created At</dt>
          <dd className="text-sm mt-0.5 font-mono" style={{ color: "var(--color-text)" }}>
            {formatDateTime(transfer.created_at)}
          </dd>
        </div>
      </dl>
    </Modal>
  );
}
