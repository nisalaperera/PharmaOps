"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { apiPost }   from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { convertToInvoiceSchema, type ConvertToInvoiceValues } from "../schemas";
import type { SalesOrder, Sale } from "@/types";

const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH",          label: "Cash"          },
  { value: "CARD",          label: "Card"          },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CREDIT",        label: "Credit"        },
  { value: "CHEQUE",        label: "Cheque"        },
];

interface ConvertToInvoiceModalProps {
  isOpen:  boolean;
  onClose: () => void;
  order:   SalesOrder | null;
}

export function ConvertToInvoiceModal({ isOpen, onClose, order }: ConvertToInvoiceModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<ConvertToInvoiceValues>({
    resolver:      zodResolver(convertToInvoiceSchema),
    defaultValues: {
      payment_method: "CASH",
      paid_amount:    0,
      invoice_date:   "",
    },
  });

  const watchedMethod = form.watch("payment_method");

  useEffect(() => {
    if (!isOpen || !order) return;
    form.reset({
      payment_method: "CASH",
      paid_amount:    order.total_amount,
      invoice_date:   new Date().toISOString().slice(0, 10),
    });
  }, [isOpen, order]);

  const mutation = useMutation({
    mutationFn: (values: ConvertToInvoiceValues) =>
      apiPost<Sale>(`/sales/orders/${order!.id}/convert`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      showToast("success", "Order Converted", "Sales order has been converted to an invoice and stock deducted.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Conversion Failed", err?.message ?? "Could not convert the order to an invoice.");
    },
  });

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Convert Order to Invoice" size="sm">
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">

        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-surface-2)" }}
        >
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>
            Order #{order.id.slice(-8).toUpperCase()}
          </p>
          <p className="mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {order.customer_name || "Walk-in"} · {order.items.length} item(s) · LKR {order.total_amount.toFixed(2)}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Invoice Date <span className="text-danger-500">*</span>
          </label>
          <Input
            type="date"
            {...form.register("invoice_date")}
            error={form.formState.errors.invoice_date?.message}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Payment Method <span className="text-danger-500">*</span>
          </label>
          <Controller
            name="payment_method"
            control={form.control}
            render={({ field }) => (
              <select {...field} className="form-select w-full">
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Paid Amount <span className="text-danger-500">*</span>
          </label>
          <Input
            type="number"
            min={0}
            step="0.01"
            {...form.register("paid_amount", { valueAsNumber: true })}
            error={form.formState.errors.paid_amount?.message}
          />
          {order.total_amount > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Order total: LKR {order.total_amount.toFixed(2)}
            </p>
          )}
        </div>

        {watchedMethod === "CHEQUE" && (
          <div className="space-y-3 rounded-lg p-3 border" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Cheque Details</p>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Cheque Number <span className="text-danger-500">*</span>
              </label>
              <Input
                placeholder="e.g. 000123"
                {...form.register("cheque_details.cheque_number")}
                error={form.formState.errors.cheque_details?.cheque_number?.message}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Bank Name <span className="text-danger-500">*</span>
              </label>
              <Input
                placeholder="e.g. Commercial Bank"
                {...form.register("cheque_details.bank_name")}
                error={form.formState.errors.cheque_details?.bank_name?.message}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Clearance Date <span className="text-danger-500">*</span>
              </label>
              <Input
                type="date"
                {...form.register("cheque_details.clearance_date")}
                error={form.formState.errors.cheque_details?.clearance_date?.message}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending} leftIcon={<FileText className="w-3.5 h-3.5" />}>
            Convert to Invoice
          </Button>
        </div>
      </form>
    </Modal>
  );
}
