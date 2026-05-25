"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard } from "lucide-react";
import { Modal }  from "@/components/ui/Modal";
import { Badge }  from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import {
  GRN_STATUS_VARIANT, GRN_STATUS_LABEL,
  PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT, PURCHASE_INVOICE_PAYMENT_STATUS_LABEL,
} from "@/lib/badges";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { apiPost }   from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { addPaymentSchema, type AddPaymentValues } from "../schemas";
import type { PurchaseInvoice } from "@/types";

interface PurchaseInvoiceViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  invoice:       PurchaseInvoice | null;
  branchNameMap: Record<string, string>;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH",          label: "Cash"          },
  { value: "CARD",          label: "Card"          },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE",        label: "Cheque"        },
];

export function PurchaseInvoiceViewModal({ isOpen, onClose, invoice, branchNameMap }: PurchaseInvoiceViewModalProps) {
  const queryClient     = useQueryClient();
  const [addingPayment, setAddingPayment] = useState(false);

  const form = useForm<AddPaymentValues>({
    resolver:      zodResolver(addPaymentSchema),
    defaultValues: { amount: 0, payment_date: "", payment_method: "CASH" },
  });

  const paymentMutation = useMutation({
    mutationFn: (values: AddPaymentValues) =>
      apiPost<PurchaseInvoice>(`/purchases/invoices/${invoice!.id}/payments`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      showToast("success", "Payment Recorded", "Payment entry has been added to this invoice.");
      setAddingPayment(false);
      form.reset({ amount: 0, payment_date: "", payment_method: "CASH" });
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Payment Failed", err?.message ?? "Something went wrong.");
    },
  });

  if (!invoice) return null;

  const totalReceived = invoice.items.reduce((sum, item) => sum + item.received_quantity * item.unit_price, 0);
  const totalPaid     = invoice.payment_entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Purchase Invoice" size="xl">
      <div className="space-y-6">

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Invoice #</dt>
            <dd className="text-sm font-mono font-semibold mt-1" style={{ color: "var(--color-text)" }}>
              {invoice.invoice_number || `#${invoice.id.slice(0, 8).toUpperCase()}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Receipt Status</dt>
            <dd className="mt-1"><Badge variant={GRN_STATUS_VARIANT[invoice.status]}>{GRN_STATUS_LABEL[invoice.status]}</Badge></dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Payment Status</dt>
            <dd className="mt-1">
              <Badge variant={PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT[invoice.payment_status]}>
                {PURCHASE_INVOICE_PAYMENT_STATUS_LABEL[invoice.payment_status]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Invoice Date</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.invoice_date?.slice(0, 10) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Purchase Order</dt>
            <dd className="text-sm font-mono mt-1" style={{ color: "var(--color-text)" }}>#{invoice.purchase_order_id.slice(0, 8).toUpperCase()}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Branch</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{branchNameMap[invoice.branch_id] ?? invoice.branch_id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Supplier</dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>{invoice.supplier_name || invoice.supplier_id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Channel</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.channel_name || invoice.channel_id}</dd>
          </div>
          {invoice.supplier_invoice_ref && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Supplier Ref</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.supplier_invoice_ref}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Received At</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{invoice.received_at.slice(0, 10)}</dd>
          </div>
          {invoice.notes && (
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Notes</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.notes}</dd>
            </div>
          )}
        </dl>

        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>Items ({invoice.items.length})</h3>
          <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  {["Product", "Ordered", "Received", "Batch #", "Expiry", "Unit Price", "Amount"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, idx) => {
                  const isPartial = item.received_quantity < item.ordered_quantity;
                  return (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>{item.product_name}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.ordered_quantity}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className={isPartial ? "font-semibold text-amber-500" : ""} style={!isPartial ? { color: "var(--color-text)" } : undefined}>
                          {item.received_quantity}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>{item.batch_number}</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{item.expiry_date}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.unit_price.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>
                        {(item.received_quantity * item.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                  <td colSpan={6} className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Total</td>
                  <td className="px-3 py-2 tabular-nums font-bold" style={{ color: "var(--color-text)" }}>{totalReceived.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Payments</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Paid: {totalPaid.toFixed(2)} / {totalReceived.toFixed(2)}
                {totalPaid < totalReceived && (
                  <span className="ml-2 text-amber-500 font-medium">Balance: {(totalReceived - totalPaid).toFixed(2)}</span>
                )}
              </p>
            </div>
            {invoice.payment_status !== "PAID" && (
              <Button variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddingPayment((v) => !v)}>
                Add Payment
              </Button>
            )}
          </div>

          {addingPayment && (
            <form
              onSubmit={form.handleSubmit((v) => paymentMutation.mutate(v))}
              className="mb-4 p-4 rounded-lg border space-y-3"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text)" }}>Amount <span className="text-danger-500">*</span></label>
                  <Input type="number" min={0.01} step="0.01" {...form.register("amount", { valueAsNumber: true })} error={form.formState.errors.amount?.message} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text)" }}>Date <span className="text-danger-500">*</span></label>
                  <Input type="date" {...form.register("payment_date")} error={form.formState.errors.payment_date?.message} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text)" }}>Method <span className="text-danger-500">*</span></label>
                  <Controller
                    name="payment_method"
                    control={form.control}
                    render={({ field }) => (
                      <select {...field} className="form-select w-full h-9 text-sm">
                        {PAYMENT_METHOD_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    )}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAddingPayment(false)}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" isLoading={paymentMutation.isPending} leftIcon={<CreditCard className="w-3.5 h-3.5" />}>
                  Record Payment
                </Button>
              </div>
            </form>
          )}

          {invoice.payment_entries.length > 0 ? (
            <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {["Date", "Method", "Amount"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.payment_entries.map((entry, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{entry.payment_date}</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{PAYMENT_METHOD_LABEL[entry.payment_method] ?? entry.payment_method}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>{entry.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 rounded-lg border border-dashed text-xs" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
              No payments recorded yet
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
