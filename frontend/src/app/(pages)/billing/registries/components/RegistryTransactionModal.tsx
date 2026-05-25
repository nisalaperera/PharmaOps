"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { apiPost } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import {
  registryTransactionSchema,
  type RegistryTransactionValues,
} from "@/app/(pages)/billing/registries/schemas";
import type { CashRegistry } from "@/types";

interface RegistryTransactionModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  registry:        CashRegistry | null;
  transactionType: "DEPOSIT" | "WITHDRAWAL";
}

export function RegistryTransactionModal({
  isOpen,
  onClose,
  registry,
  transactionType,
}: RegistryTransactionModalProps) {
  const queryClient = useQueryClient();

  const isDeposit  = transactionType === "DEPOSIT";
  const title      = isDeposit
    ? `Deposit to ${registry?.name ?? ""}`
    : `Withdraw from ${registry?.name ?? ""}`;

  const form = useForm<RegistryTransactionValues>({
    resolver:      zodResolver(registryTransactionSchema),
    defaultValues: {
      amount: 0,
      notes:  "",
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ amount: 0, notes: "" });
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const transactionMutation = useMutation({
    mutationFn: (values: RegistryTransactionValues) => {
      const endpoint = isDeposit
        ? `/treasury/registries/${registry!.id}/deposit`
        : `/treasury/registries/${registry!.id}/withdraw`;
      return apiPost<CashRegistry>(endpoint, values);
    },
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      const amountLabel = `LKR ${values.amount.toFixed(2)}`;
      if (isDeposit) {
        showToast("success", "Deposit Recorded", `${amountLabel} deposited to ${registry!.name}.`);
      } else {
        showToast("success", "Withdrawal Recorded", `${amountLabel} withdrawn from ${registry!.name}.`);
      }
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast(
        "error",
        isDeposit ? "Deposit Failed" : "Withdrawal Failed",
        err?.message ?? "Something went wrong. Please try again."
      );
    },
  });

  if (!registry) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={transactionMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant={isDeposit ? "primary" : "danger"}
            onClick={form.handleSubmit((values) => transactionMutation.mutate(values))}
            isLoading={transactionMutation.isPending}
          >
            {isDeposit ? "Record Deposit" : "Record Withdrawal"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Current Balance — read-only display */}
        <div>
          <p className="form-label">Current Balance</p>
          <div
            className="form-input bg-[var(--color-surface-2)] cursor-not-allowed tabular-nums font-medium"
            style={{ color: "var(--color-text)" }}
          >
            LKR {registry.current_balance.toFixed(2)}
          </div>
        </div>

        {/* Amount */}
        <Input
          label="Amount"
          type="number"
          min={0.01}
          step="0.01"
          placeholder="0.00"
          required
          error={form.formState.errors.amount?.message}
          {...form.register("amount", { valueAsNumber: true })}
        />

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            rows={3}
            placeholder="Optional notes…"
            className="form-input resize-none"
            {...form.register("notes")}
          />
        </div>

      </div>
    </Modal>
  );
}
