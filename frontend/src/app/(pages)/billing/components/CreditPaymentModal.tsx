"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { Modal }    from "@/components/ui/Modal";
import { Button }   from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { showToast } from "@/lib/toast";
import { apiPost }   from "@/lib/api-client";
import { CREDIT_PAYMENT_METHOD_OPTIONS } from "@/lib/constants";
import { creditPaymentSchema, type CreditPaymentValues } from "../schemas";
import type { Sale, CreditPayment } from "@/types";

interface CreditPaymentModalProps {
  sale:     Sale | null;
  branchId: string;
  onClose:  () => void;
}

export function CreditPaymentModal({ sale, branchId, onClose }: CreditPaymentModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreditPaymentValues>({
    resolver: zodResolver(creditPaymentSchema),
    defaultValues: {
      payment_method: "CASH",
      amount:         undefined,
      notes:          "",
    },
  });

  useEffect(() => {
    if (sale) {
      reset({
        patient_id:     sale.customer_id ?? "",
        sale_id:        sale.id,
        branch_id:      branchId,
        payment_method: "CASH",
        amount:         undefined,
        notes:          "",
      });
    }
  }, [sale, branchId, reset]);

  const mutation = useMutation({
    mutationFn: (data: CreditPaymentValues) =>
      apiPost<CreditPayment>("/billing/payments", data),
    onSuccess: () => {
      showToast("success", "Payment recorded", "Credit payment has been applied to the patient's balance.");
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["billing-payments"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      onClose();
    },
    onError: (err: Error) => {
      showToast("error", "Failed to record payment", err.message);
    },
  });

  if (!sale) return null;
  const outstandingBalance = sale.total_amount - (sale.refund_amount ?? 0);

  return (
    <Modal
      isOpen={!!sale}
      onClose={onClose}
      title="Record Credit Payment"
      size="sm"
    >
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">

        {/* Balance info */}
        <div className="rounded-xl px-4 py-3 space-y-1 text-sm" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Customer</span>
            <span className="font-medium" style={{ color: "var(--color-text)" }}>{sale.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Sale Total</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{sale.total_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span style={{ color: "var(--color-text-muted)" }}>Outstanding</span>
            <span className="tabular-nums text-warning-600">{outstandingBalance.toFixed(2)}</span>
          </div>
        </div>

        {/* Amount */}
        <div>
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <Input
                label="Payment Amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                leftIcon={<DollarSign className="w-4 h-4" />}
                error={errors.amount?.message}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.valueAsNumber || undefined)}
              />
            )}
          />
        </div>

        {/* Payment method */}
        <Select
          label="Payment Method"
          required
          options={CREDIT_PAYMENT_METHOD_OPTIONS}
          error={errors.payment_method?.message}
          {...register("payment_method")}
        />

        {/* Notes */}
        <Textarea
          label="Notes"
          placeholder="Optional notes…"
          error={errors.notes?.message}
          {...register("notes")}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            Record Payment
          </Button>
        </div>

      </form>
    </Modal>
  );
}
