"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { Modal }    from "@/components/ui/Modal";
import { Button }   from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { showToast } from "@/lib/toast";
import { apiPatch }  from "@/lib/api-client";
import { refundSchema, type RefundValues } from "../schemas";
import type { Sale } from "@/types";

const REFUND_STATUS_OPTIONS = [
  { value: "REFUNDED",       label: "Full Refund"    },
  { value: "PARTIAL_REFUND", label: "Partial Refund" },
];

interface RefundModalProps {
  sale:    Sale | null;
  onClose: () => void;
}

export function RefundModal({ sale, onClose }: RefundModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<RefundValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: {
      status:        "REFUNDED",
      refund_amount: undefined,
    },
  });

  const watchedStatus = watch("status");

  useEffect(() => {
    if (sale) {
      reset({ status: "REFUNDED", refund_amount: undefined });
    }
  }, [sale, reset]);

  const mutation = useMutation({
    mutationFn: (data: RefundValues) =>
      apiPatch<Sale>(`/sales/${sale!.id}`, data),
    onSuccess: () => {
      showToast("success", "Refund processed", "The sale status has been updated.");
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      onClose();
    },
    onError: (err: Error) => {
      showToast("error", "Refund failed", err.message);
    },
  });

  if (!sale) return null;

  return (
    <Modal
      isOpen={!!sale}
      onClose={onClose}
      title="Process Refund"
      size="sm"
    >
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">

        {/* Sale info */}
        <div className="rounded-xl px-4 py-3 space-y-1 text-sm" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Sale Total</span>
            <span className="tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>
              {sale.total_amount.toFixed(2)}
            </span>
          </div>
          {sale.customer_name && (
            <div className="flex justify-between">
              <span style={{ color: "var(--color-text-muted)" }}>Customer</span>
              <span style={{ color: "var(--color-text)" }}>{sale.customer_name}</span>
            </div>
          )}
        </div>

        {/* Refund type */}
        <Select
          label="Refund Type"
          required
          options={REFUND_STATUS_OPTIONS}
          error={errors.status?.message}
          {...register("status")}
        />

        {/* Partial amount */}
        {watchedStatus === "PARTIAL_REFUND" && (
          <Controller
            name="refund_amount"
            control={control}
            render={({ field }) => (
              <Input
                label="Refund Amount"
                type="number"
                min="0.01"
                step="0.01"
                max={sale.total_amount}
                required
                leftIcon={<DollarSign className="w-4 h-4" />}
                error={errors.refund_amount?.message}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.valueAsNumber || undefined)}
              />
            )}
          />
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" isLoading={mutation.isPending}>
            Process Refund
          </Button>
        </div>

      </form>
    </Modal>
  );
}
