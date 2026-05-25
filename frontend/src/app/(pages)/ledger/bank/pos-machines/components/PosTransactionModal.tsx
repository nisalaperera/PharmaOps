"use client";

import { useEffect }              from "react";
import { useForm }                from "react-hook-form";
import { zodResolver }            from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }                  from "@/components/ui/Modal";
import { Button }                 from "@/components/ui/Button";
import { Input }                  from "@/components/ui/Input";
import { apiPost }                from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { POS_CARD_TYPE_OPTIONS }  from "@/lib/constants";
import { posTransactionSchema, type PosTransactionValues } from "../schemas";
import type { PosMachine, PosTransaction } from "@/types";

interface PosTransactionModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  machine:  PosMachine;
}

export function PosTransactionModal({ isOpen, onClose, machine }: PosTransactionModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<PosTransactionValues>({
    resolver:      zodResolver(posTransactionSchema),
    defaultValues: {
      amount:           0,
      card_type:        "VISA",
      reference_number: "",
      transaction_date: new Date().toISOString().slice(0, 10),
      notes:            "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        amount:           0,
        card_type:        "VISA",
        reference_number: "",
        transaction_date: new Date().toISOString().slice(0, 10),
        notes:            "",
      });
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: (values: PosTransactionValues) =>
      apiPost<PosTransaction>(
        `/treasury/bank-accounts/pos-machines/machines/${machine.id}/transactions`,
        values,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-transactions", machine.id] });
      queryClient.invalidateQueries({ queryKey: ["pos-machines"] });
      showToast("success", "Transaction Added", "POS transaction has been recorded.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Add Failed", err?.message ?? "Could not record the transaction.");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add POS Transaction" size="sm">
      <div
        className="rounded-lg px-4 py-2.5 mb-4 text-sm"
        style={{ background: "var(--color-surface-2)" }}
      >
        <p className="font-semibold" style={{ color: "var(--color-text)" }}>
          TID: {machine.terminal_id}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {machine.bank_account_name} — {machine.bank_name}
        </p>
      </div>

      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Amount (LKR) <span className="text-danger-500">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min={0.01}
              {...form.register("amount", { valueAsNumber: true })}
              error={form.formState.errors.amount?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Card Type <span className="text-danger-500">*</span>
            </label>
            <select {...form.register("card_type")} className="form-select w-full">
              {POS_CARD_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Transaction Date <span className="text-danger-500">*</span>
          </label>
          <Input
            type="date"
            {...form.register("transaction_date")}
            error={form.formState.errors.transaction_date?.message}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Reference No.{" "}
            <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
          </label>
          <Input placeholder="Terminal receipt / approval code" {...form.register("reference_number")} />
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
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            Add Transaction
          </Button>
        </div>
      </form>
    </Modal>
  );
}
