"use client";

import { useEffect, useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CreditCard } from "lucide-react";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { apiPost }      from "@/lib/api-client";
import { showToast }    from "@/lib/toast";
import { formatAmount } from "@/lib/utils";
import { PURCHASE_PAYMENT_METHOD_OPTIONS } from "@/lib/constants";
import { purchasePaymentSchema, type PurchasePaymentValues } from "../schemas";
import type { PurchaseInvoice } from "@/types";

interface MultiPaymentModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  invoices: PurchaseInvoice[];
}

export function MultiPaymentModal({ isOpen, onClose, invoices }: MultiPaymentModalProps) {
  const queryClient = useQueryClient();

  // Only settle invoices that still have an outstanding balance.
  const payable = useMemo(
    () => invoices.filter((i) => i.net_amount - i.paid_amount > 0.001),
    [invoices],
  );

  const form = useForm<PurchasePaymentValues>({
    resolver:      zodResolver(purchasePaymentSchema),
    defaultValues: {
      payment_date:   format(new Date(), "yyyy-MM-dd"),
      payment_method: "CASH",
      reference:      "",
      allocations:    [],
    },
  });

  const { fields, replace } = useFieldArray({ control: form.control, name: "allocations", keyName: "rhfKey" });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      payment_date:   format(new Date(), "yyyy-MM-dd"),
      payment_method: "CASH",
      reference:      "",
      allocations:    payable.map((i) => ({ invoice_id: i.id, amount: Number((i.net_amount - i.paid_amount).toFixed(2)) })),
    });
    replace(payable.map((i) => ({ invoice_id: i.id, amount: Number((i.net_amount - i.paid_amount).toFixed(2)) })));
  }, [isOpen, payable.length]);

  const watchedAllocs = form.watch("allocations");
  const totalToPay    = watchedAllocs.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const mutation = useMutation({
    mutationFn: (values: PurchasePaymentValues) =>
      apiPost("/purchases/payments", {
        ...values,
        reference:   values.reference || null,
        allocations: values.allocations.filter((a) => (Number(a.amount) || 0) > 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      showToast("success", "Payment Recorded", `Settled ${watchedAllocs.filter((a) => a.amount > 0).length} invoice(s).`);
      onClose();
    },
    onError: (err: { message?: string }) => showToast("error", "Payment Failed", err?.message ?? "Something went wrong."),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Payment" size="xl">
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Payment Date <span className="text-danger-500">*</span></label>
            <Input type="date" {...form.register("payment_date")} error={form.formState.errors.payment_date?.message} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Method <span className="text-danger-500">*</span></label>
            <Controller name="payment_method" control={form.control} render={({ field }) => (
              <select {...field} className="form-select w-full">
                {PURCHASE_PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Reference</label>
            <Input placeholder="Cheque/transfer ref" {...form.register("reference")} />
          </div>
        </div>

        {payable.length === 0 ? (
          <div className="text-center py-8 rounded-lg border border-dashed text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            None of the selected invoices have an outstanding balance.
          </div>
        ) : (
          <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  {["Invoice #", "Distributor", "Net", "Outstanding", "Allocate"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const inv = payable[index];
                  if (!inv) return null;
                  const outstanding = inv.net_amount - inv.paid_amount;
                  return (
                    <tr key={field.rhfKey} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text)" }}>{inv.invoice_number}</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{inv.supplier_name}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatAmount(inv.net_amount)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>{formatAmount(outstanding)}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min={0} max={outstanding} step="0.01"
                          className="max-w-[140px] text-right"
                          {...form.register(`allocations.${index}.amount`, { valueAsNumber: true })}
                        />
                        <input type="hidden" {...form.register(`allocations.${index}.invoice_id`)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold" style={{ color: "var(--color-text-muted)" }}>Total Payment</td>
                  <td className="px-3 py-2 tabular-nums font-bold" style={{ color: "var(--color-text)" }}>{formatAmount(totalToPay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending} disabled={payable.length === 0 || totalToPay <= 0} leftIcon={<CreditCard className="w-4 h-4" />}>Record Payment</Button>
        </div>
      </form>
    </Modal>
  );
}
