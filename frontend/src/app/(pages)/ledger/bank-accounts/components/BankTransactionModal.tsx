"use client";

import { useEffect }      from "react";
import { useForm }        from "react-hook-form";
import { zodResolver }    from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }          from "@/components/ui/Modal";
import { Button }         from "@/components/ui/Button";
import { Input }          from "@/components/ui/Input";
import { apiPost }        from "@/lib/api-client";
import { showToast }      from "@/lib/toast";
import {
  bankTransactionSchema,
  type BankTransactionValues,
} from "@/app/(pages)/ledger/bank-accounts/schemas";
import type { BankAccount } from "@/types";

interface BankTransactionModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  account:         BankAccount | null;
  transactionType: "DEPOSIT" | "WITHDRAWAL";
}

export function BankTransactionModal({
  isOpen,
  onClose,
  account,
  transactionType,
}: BankTransactionModalProps) {
  const queryClient = useQueryClient();

  const isDeposit   = transactionType === "DEPOSIT";
  const modalTitle  = isDeposit ? "Deposit Funds" : "Withdraw Funds";
  const actionLabel = isDeposit ? "Deposit" : "Withdraw";
  const endpoint    = isDeposit ? "deposit" : "withdraw";

  const form = useForm<BankTransactionValues>({
    resolver:      zodResolver(bankTransactionSchema),
    defaultValues: { amount: 0, notes: "" },
  });

  // â”€â”€ Reset when modal opens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ amount: 0, notes: "" });
  }, [isOpen, account, transactionType]);

  // â”€â”€ Mutation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const mutation = useMutation({
    mutationFn: (values: BankTransactionValues) =>
      apiPost<BankAccount>(`/treasury/bank-accounts/${account!.id}/${endpoint}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-account-transactions", account?.id] });
      showToast(
        "success",
        isDeposit ? "Deposit Successful" : "Withdrawal Successful",
        isDeposit
          ? `Funds have been deposited into ${account?.account_name}.`
          : `Funds have been withdrawn from ${account?.account_name}.`
      );
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

  if (!account) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="sm">
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-4"
      >
        {/* Current Balance â€” read-only */}
        <div className="w-full">
          <label className="form-label">Current Balance</label>
          <div
            className="form-input tabular-nums font-semibold"
            style={{ color: "var(--color-text)", background: "var(--color-surface-2)" }}
          >
            LKR {account.current_balance.toFixed(2)}
          </div>
        </div>

        {/* Amount */}
        <div className="w-full">
          <label className="form-label">
            Amount (LKR) <span className="text-danger-500 ml-1">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="form-input"
            placeholder="0.00"
            {...form.register("amount", { valueAsNumber: true })}
          />
          {form.formState.errors.amount && (
            <p className="form-error">{form.formState.errors.amount.message}</p>
          )}
        </div>

        {/* Notes */}
        <Input
          label="Notes"
          placeholder="Optional note"
          {...form.register("notes")}
          error={form.formState.errors.notes?.message}
        />

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={isDeposit ? "primary" : "danger"}
            isLoading={mutation.isPending}
          >
            {actionLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
