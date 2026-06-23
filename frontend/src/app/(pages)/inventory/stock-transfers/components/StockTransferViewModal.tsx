"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Modal }       from "@/components/ui/Modal";
import { Button }      from "@/components/ui/Button";
import { Badge }       from "@/components/ui/Badge";
import { apiPost }     from "@/lib/api-client";
import { showToast }   from "@/lib/toast";
import { formatDateTime, formatQuantity } from "@/lib/utils";
import { FormattedInput } from "@/components/ui/FormattedInput";
import { TRANSFER_STATUS_VARIANT } from "@/lib/badges";
import { TRANSFER_STATUS_LABEL }   from "@/lib/constants";
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
      <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</dt>
      <dd className="text-sm mt-0.5" style={{ color: "var(--color-text)" }}>{children}</dd>
    </div>
  );
}

export function StockTransferViewModal({ isOpen, onClose, transfer, canManage }: StockTransferViewModalProps) {
  const queryClient = useQueryClient();
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});

  const actionMutation = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) =>
      apiPost<StockTransfer>(`/inventory/stock-transfers/${transfer!.id}/${action}`, body),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      const labels: Record<string, string> = {
        dispatch: "dispatched", receive: "received", confirm: "confirmed",
        reject: "rejected", cancel: "cancelled",
      };
      showToast("success", "Transfer Updated", `Transfer has been ${labels[action] ?? action}.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Action Failed", err?.message ?? "Something went wrong.");
    },
  });

  if (!transfer) return null;

  const isPending    = transfer.status === "PENDING";
  const isInTransit  = transfer.status === "IN_TRANSIT";
  const isPartial    = transfer.status === "PARTIALLY_RECEIVED";
  const canDispatch  = canManage && isPending;
  const canReceive   = canManage && (isInTransit || isPartial);
  const canReject    = canManage && (isPending || isInTransit);
  const canCancel    = canManage && isPending;

  function handleReceive() {
    const items = transfer!.items
      .map((item) => {
        const key = `${item.product_id}__${item.batch_number}`;
        const qty = receiveQtys[key] ?? 0;
        return qty > 0 ? { product_id: item.product_id, batch_number: item.batch_number, received_quantity: qty } : null;
      })
      .filter(Boolean);
    if (items.length === 0) {
      showToast("error", "No Items", "Enter received quantities for at least one item.");
      return;
    }
    actionMutation.mutate({ action: "receive", body: { items } });
  }

  const footer = (
    <>
      <Button variant="outline" onClick={onClose} disabled={actionMutation.isPending}>Close</Button>
      {canCancel && (
        <Button variant="outline" onClick={() => actionMutation.mutate({ action: "cancel" })} isLoading={actionMutation.isPending}>
          Cancel Transfer
        </Button>
      )}
      {canReject && (
        <Button variant="danger" onClick={() => actionMutation.mutate({ action: "reject" })} isLoading={actionMutation.isPending}>
          Reject
        </Button>
      )}
      {canDispatch && (
        <Button variant="primary" onClick={() => actionMutation.mutate({ action: "dispatch" })} isLoading={actionMutation.isPending}>
          Dispatch
        </Button>
      )}
      {canReceive && (
        <Button variant="primary" onClick={handleReceive} isLoading={actionMutation.isPending}>
          Receive Items
        </Button>
      )}
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stock Transfer Details" size="lg" footer={footer}>
      <div className="space-y-5">

        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex-1 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {transfer.source_branch_name || transfer.source_branch_id}
          </div>
          <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
          <div className="flex-1 text-sm font-semibold text-right" style={{ color: "var(--color-text)" }}>
            {transfer.destination_branch_name || transfer.destination_branch_id}
          </div>
          <Badge variant={TRANSFER_STATUS_VARIANT[transfer.status]}>
            {TRANSFER_STATUS_LABEL[transfer.status]}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <DetailRow label="Transfer #">
            <span className="font-mono text-xs">{transfer.transfer_number || transfer.id}</span>
          </DetailRow>
          <DetailRow label="Initiated On">{formatDateTime(transfer.created_at)}</DetailRow>
          {transfer.dispatched_at && (
            <DetailRow label="Dispatched On">{formatDateTime(transfer.dispatched_at)}</DetailRow>
          )}
          {transfer.received_at && (
            <DetailRow label="Received On">{formatDateTime(transfer.received_at)}</DetailRow>
          )}
          {transfer.confirmed_at && (
            <DetailRow label="Confirmed On">{formatDateTime(transfer.confirmed_at)}</DetailRow>
          )}
          {transfer.notes && (
            <div className="col-span-2">
              <DetailRow label="Notes">{transfer.notes}</DetailRow>
            </div>
          )}
        </dl>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
            Transfer Items ({transfer.items.length})
          </p>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-table-header)" }}>
                  {["Product", "Batch No.", "Qty", ...(canReceive ? ["Received", "Receive Now"] : (isPartial || transfer.status === "RECEIVED" ? ["Received"] : []))].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((item, i) => {
                  const key = `${item.product_id}__${item.batch_number}`;
                  const alreadyReceived = item.received_quantity ?? 0;
                  const remaining = item.quantity - alreadyReceived;
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>
                        {item.product_name || item.product_id}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {item.batch_number}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: "var(--color-text)" }}>
                        {formatQuantity(item.quantity)}
                      </td>
                      {(canReceive || isPartial || transfer.status === "RECEIVED") && (
                        <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {formatQuantity(alreadyReceived)}
                        </td>
                      )}
                      {canReceive && (
                        <td className="px-2 py-1.5">
                          <FormattedInput
                            format="quantity"
                            min={0}
                            max={remaining}
                            value={receiveQtys[key] ?? 0}
                            onChange={(v) => setReceiveQtys((prev) => ({ ...prev, [key]: Math.min(v, remaining) }))}
                            className="text-xs w-20"
                            placeholder={String(remaining)}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Modal>
  );
}
