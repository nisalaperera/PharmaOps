"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Modal }       from "@/components/ui/Modal";
import { Button }      from "@/components/ui/Button";
import { Badge }       from "@/components/ui/Badge";
import { apiPost }     from "@/lib/api-client";
import { showToast }   from "@/lib/toast";
import { formatDateTime } from "@/lib/utils";
import { TRANSFER_STATUS_VARIANT } from "@/lib/badges";
import type { StockTransfer } from "@/types";

interface StockTransferViewModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  transfer:   StockTransfer | null;
  canManage:  boolean;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </dt>
      <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>
        {children}
      </dd>
    </div>
  );
}

export function StockTransferViewModal({ isOpen, onClose, transfer, canManage }: StockTransferViewModalProps) {
  const queryClient = useQueryClient();

  const actionMutation = useMutation({
    mutationFn: ({ action }: { action: "confirm" | "reject" | "cancel" }) =>
      apiPost<StockTransfer>(`/inventory/stock-transfers/${transfer!.id}/${action}`),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      const labels = { confirm: "confirmed", reject: "rejected", cancel: "cancelled" };
      showToast("success", "Transfer Updated", `Transfer has been ${labels[action]}.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Action Failed", err?.message ?? "Something went wrong.");
    },
  });

  if (!transfer) return null;

  const isPending   = transfer.status === "PENDING";
  const statusLabel = transfer.status.charAt(0) + transfer.status.slice(1).toLowerCase();

  const footer = (
    <>
      <Button variant="outline" onClick={onClose} disabled={actionMutation.isPending}>
        Close
      </Button>
      {canManage && isPending && (
        <>
          <Button
            variant="outline"
            onClick={() => actionMutation.mutate({ action: "cancel" })}
            isLoading={actionMutation.isPending}
          >
            Cancel Transfer
          </Button>
          <Button
            variant="danger"
            onClick={() => actionMutation.mutate({ action: "reject" })}
            isLoading={actionMutation.isPending}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            onClick={() => actionMutation.mutate({ action: "confirm" })}
            isLoading={actionMutation.isPending}
          >
            Confirm
          </Button>
        </>
      )}
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Transfer Details"
      size="lg"
      footer={footer}
    >
      <div className="space-y-5">

        {/* Status + Branches */}
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex-1 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {transfer.source_branch_name || transfer.source_branch_id}
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
          <div className="flex-1 text-sm font-semibold text-right" style={{ color: "var(--color-text)" }}>
            {transfer.destination_branch_name || transfer.destination_branch_id}
          </div>
          <Badge variant={TRANSFER_STATUS_VARIANT[transfer.status]}>{statusLabel}</Badge>
        </div>

        {/* Meta */}
        <dl className="grid grid-cols-2 gap-4">
          <DetailRow label="Transfer ID">
            <span className="font-mono text-xs">{transfer.id}</span>
          </DetailRow>
          <DetailRow label="Initiated On">
            {formatDateTime(transfer.created_at)}
          </DetailRow>
          {transfer.confirmed_at && (
            <DetailRow label="Confirmed On">
              {formatDateTime(transfer.confirmed_at)}
            </DetailRow>
          )}
          {transfer.notes && (
            <div className="col-span-2">
              <DetailRow label="Notes">{transfer.notes}</DetailRow>
            </div>
          )}
        </dl>

        {/* Items table */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
            Transfer Items ({transfer.items.length})
          </p>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-table-header)" }}>
                  {["Product", "Batch No.", "Qty"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((item, i) => (
                  <tr
                    key={i}
                    className="border-t"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>
                      {item.product_name || item.product_id}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {item.batch_number}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: "var(--color-text)" }}>
                      {item.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Modal>
  );
}
