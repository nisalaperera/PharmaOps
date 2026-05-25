"use client";

import { useEffect }                     from "react";
import { useForm }                        from "react-hook-form";
import { zodResolver }                    from "@hookform/resolvers/zod";
import { useMutation, useQueryClient }    from "@tanstack/react-query";
import { Modal }                          from "@/components/ui/Modal";
import { Button }                         from "@/components/ui/Button";
import { Input }                          from "@/components/ui/Input";
import { Badge }                          from "@/components/ui/Badge";
import { apiPatch }                       from "@/lib/api-client";
import { showToast }                      from "@/lib/toast";
import { PAYMENT_METHOD_VARIANT }         from "@/lib/badges";
import { PAYMENT_METHOD_LABEL }           from "@/lib/constants";
import { saleRefundSchema }               from "../schemas";
import type { SaleRefundFormValues }      from "../schemas";
import type { Sale }                      from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SaleRefundModalProps {
  isOpen:  boolean;
  onClose: () => void;
  sale:    Sale | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SaleRefundModal({ isOpen, onClose, sale }: SaleRefundModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<SaleRefundFormValues>({
    resolver:      zodResolver(saleRefundSchema),
    defaultValues: { status: "REFUNDED", refund_amount: undefined },
  });

  const selectedStatus   = form.watch("status");
  const isPartialRefund  = selectedStatus === "PARTIAL_REFUND";

  useEffect(() => {
    if (isOpen) form.reset({ status: "REFUNDED", refund_amount: undefined });
  }, [isOpen]);

  const refundMutation = useMutation({
    mutationFn: (values: SaleRefundFormValues) =>
      apiPatch<Sale>(`/sales/${sale!.id}`, {
        status:        values.status,
        ...(values.refund_amount && { refund_amount: values.refund_amount }),
      }),
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      showToast(
        "success",
        values.status === "REFUNDED" ? "Sale Refunded" : "Partial Refund Processed",
        `Sale #${sale!.id.slice(-8).toUpperCase()} has been updated.`,
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Refund Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!sale) return null;

  const shortId = sale.id.slice(-8).toUpperCase();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Process Refund" size="sm">
      {/* Sale summary */}
      <div className="rounded-xl p-3 mb-4 space-y-1" style={{ background: "var(--color-surface-2)" }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Sale #{shortId}</p>
          <Badge variant={PAYMENT_METHOD_VARIANT[sale.payment_method] ?? "default"}>
            {PAYMENT_METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
          </Badge>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {sale.customer_name || "Walk-in"} · Total LKR {sale.total_amount.toFixed(2)}
        </p>
      </div>

      <form onSubmit={form.handleSubmit((v) => refundMutation.mutate(v))} className="space-y-4">
        {/* Refund type */}
        <div className="space-y-2">
          <label className="form-label">Refund Type <span className="text-danger-500">*</span></label>
          <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors" style={{ borderColor: "var(--color-border)" }}>
            <input type="radio" value="REFUNDED" className="mt-0.5 accent-primary-500" {...form.register("status")} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Full Refund</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Refund the entire sale amount of LKR {sale.total_amount.toFixed(2)}.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors" style={{ borderColor: "var(--color-border)" }}>
            <input type="radio" value="PARTIAL_REFUND" className="mt-0.5 accent-primary-500" {...form.register("status")} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Partial Refund</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Refund a specific amount less than the total.
              </p>
            </div>
          </label>
        </div>

        {/* Refund amount (partial only) */}
        {isPartialRefund && (
          <Input
            label="Refund Amount (LKR)"
            type="number"
            step="0.01"
            placeholder="0.00"
            required
            error={form.formState.errors.refund_amount?.message}
            {...form.register("refund_amount")}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" isLoading={refundMutation.isPending}>
            Confirm Refund
          </Button>
        </div>
      </form>
    </Modal>
  );
}
