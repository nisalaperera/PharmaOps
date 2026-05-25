"use client";

import { useEffect }              from "react";
import { useForm }                from "react-hook-form";
import { zodResolver }            from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote }               from "lucide-react";
import { Modal }                  from "@/components/ui/Modal";
import { Button }                 from "@/components/ui/Button";
import { Input }                  from "@/components/ui/Input";
import { apiPost }                from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { posSettleSchema, type PosSettleValues } from "../schemas";
import type { PosMachine, PosSettlement } from "@/types";

interface PosSettleModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  machine:  PosMachine | null;
}

export function PosSettleModal({ isOpen, onClose, machine }: PosSettleModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<PosSettleValues>({
    resolver:      zodResolver(posSettleSchema),
    defaultValues: {
      settlement_date: new Date().toISOString().slice(0, 10),
      notes:           "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        settlement_date: new Date().toISOString().slice(0, 10),
        notes:           "",
      });
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: (values: PosSettleValues) =>
      apiPost<PosSettlement>(
        `/treasury/bank-accounts/pos-machines/machines/${machine!.id}/settle`,
        values,
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pos-machines"] });
      queryClient.invalidateQueries({ queryKey: ["pos-transactions", machine!.id] });
      queryClient.invalidateQueries({ queryKey: ["pos-settlements", machine!.id] });
      showToast(
        "success",
        "Settlement Completed",
        `LKR ${result.total_amount.toFixed(2)} from ${result.transaction_count} transaction(s) deposited to ${machine!.bank_account_name}.`,
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Settlement Failed", err?.message ?? "Could not complete the settlement.");
    },
  });

  if (!machine) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settle POS Machine" size="sm">
      <div
        className="rounded-xl px-4 py-4 mb-5 space-y-2"
        style={{ background: "var(--color-surface-2)" }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              TID: {machine.terminal_id}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Settling to: {machine.bank_account_name} — {machine.bank_name}
            </p>
          </div>
          <Banknote className="w-5 h-5 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
        </div>

        <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Unsettled Amount</p>
          <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: "var(--color-text)" }}>
            LKR {machine.unsettled_amount.toFixed(2)}
          </p>
        </div>
      </div>

      {machine.unsettled_amount <= 0 ? (
        <p className="text-sm text-center py-4" style={{ color: "var(--color-text-muted)" }}>
          No unsettled transactions to settle.
        </p>
      ) : (
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Settlement Date <span className="text-danger-500">*</span>
            </label>
            <Input
              type="date"
              {...form.register("settlement_date")}
              error={form.formState.errors.settlement_date?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Notes{" "}
              <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
            </label>
            <textarea
              {...form.register("notes")}
              rows={2}
              className="form-input w-full resize-none"
              placeholder="e.g. Daily batch settlement"
            />
          </div>

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            All unsettled transactions will be marked settled and{" "}
            <strong>LKR {machine.unsettled_amount.toFixed(2)}</strong> will be deposited into{" "}
            <strong>{machine.bank_account_name}</strong>.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={mutation.isPending}>
              Confirm Settlement
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
