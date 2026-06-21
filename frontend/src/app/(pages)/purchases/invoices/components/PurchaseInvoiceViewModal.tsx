"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Modal }  from "@/components/ui/Modal";
import { Badge }  from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import {
  PURCHASE_INVOICE_STATUS_VARIANT, PURCHASE_INVOICE_STATUS_LABEL,
  PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT, PURCHASE_INVOICE_PAYMENT_STATUS_LABEL,
} from "@/lib/badges";
import { PAYMENT_METHOD_LABEL, PURCHASE_PAYMENT_METHOD_OPTIONS } from "@/lib/constants";
import { apiPost }      from "@/lib/api-client";
import { showToast }    from "@/lib/toast";
import { formatAmount } from "@/lib/utils";
import { useAuth }   from "@/hooks/useAuth";
import type { PurchaseInvoice } from "@/types";

interface PurchaseInvoiceViewModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  invoice:       PurchaseInvoice | null;
  branchNameMap: Record<string, string>;
}

const singlePaymentSchema = z.object({
  amount:         z.coerce.number().min(0.01, "Amount must be greater than 0"),
  payment_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  payment_method: z.enum(["CASH", "CHEQUE", "BANK_TRANSFER"]),
  reference:      z.string().optional(),
});
type SinglePaymentValues = z.infer<typeof singlePaymentSchema>;

export function PurchaseInvoiceViewModal({ isOpen, onClose, invoice, branchNameMap }: PurchaseInvoiceViewModalProps) {
  const queryClient = useQueryClient();
  const { permissions } = useAuth();
  const canVerify = permissions?.can("BRANCH_MANAGER") ?? false;
  const [addingPayment, setAddingPayment] = useState(false);

  const form = useForm<SinglePaymentValues>({
    resolver:      zodResolver(singlePaymentSchema),
    defaultValues: { amount: 0, payment_date: "", payment_method: "CASH", reference: "" },
  });

  const paymentMutation = useMutation({
    mutationFn: (values: SinglePaymentValues) =>
      apiPost("/purchases/payments", {
        payment_date:   values.payment_date,
        payment_method: values.payment_method,
        reference:      values.reference || null,
        allocations:    [{ invoice_id: invoice!.id, amount: values.amount }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      showToast("success", "Payment Recorded", "Payment has been allocated to this invoice.");
      setAddingPayment(false);
      form.reset({ amount: 0, payment_date: "", payment_method: "CASH", reference: "" });
    },
    onError: (err: { message?: string }) => showToast("error", "Payment Failed", err?.message ?? "Something went wrong."),
  });

  const verifyMutation = useMutation({
    mutationFn: () => apiPost(`/purchases/invoices/${invoice!.id}/verify`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast("success", "Invoice Verified", "Items have been posted to inventory.");
      onClose();
    },
    onError: (err: { message?: string }) => showToast("error", "Verify Failed", err?.message ?? "Something went wrong."),
  });

  if (!invoice) return null;

  const balance = invoice.net_amount - invoice.paid_amount;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Purchase Invoice" size="xl">
      <div className="space-y-6">

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Invoice #</dt>
            <dd className="text-sm font-mono font-semibold mt-1" style={{ color: "var(--color-text)" }}>{invoice.invoice_number}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Status</dt>
            <dd className="mt-1"><Badge variant={PURCHASE_INVOICE_STATUS_VARIANT[invoice.status]}>{PURCHASE_INVOICE_STATUS_LABEL[invoice.status]}</Badge></dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Invoice Date</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.invoice_date?.slice(0, 10) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Payment Status</dt>
            <dd className="mt-1"><Badge variant={PURCHASE_INVOICE_PAYMENT_STATUS_VARIANT[invoice.payment_status]}>{PURCHASE_INVOICE_PAYMENT_STATUS_LABEL[invoice.payment_status]}</Badge></dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Distributor</dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--color-text)" }}>{invoice.supplier_name || invoice.supplier_id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Channel</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.channel_name || invoice.channel_id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Branch</dt>
            <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{branchNameMap[invoice.branch_id] ?? invoice.branch_id}</dd>
          </div>
          {invoice.distributor_invoice_no && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Distributor Invoice No</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.distributor_invoice_no}</dd>
            </div>
          )}
          {invoice.distributor_invoice_date && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Distributor Invoice Date</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.distributor_invoice_date.slice(0, 10)}</dd>
            </div>
          )}
          {invoice.notes && (
            <div className="col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Notes</dt>
              <dd className="text-sm mt-1" style={{ color: "var(--color-text)" }}>{invoice.notes}</dd>
            </div>
          )}
        </dl>

        {/* Items */}
        {invoice.items.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>Items ({invoice.items.length})</h3>
            <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {["Product", "Batch No", "SKU", "Expiry", "Unit Qty", "Free", "Disc.", "Unit Price", "Sell Price", "Line Total"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>{item.product_name}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>{item.batch_number}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>{item.sku || "—"}</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{item.expiry_date}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text)" }}>{item.unit_quantity}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{item.free_quantity}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatAmount(item.discount)}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatAmount(item.unit_price)}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatAmount(item.selling_price)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-right" style={{ color: "var(--color-text)" }}>{formatAmount(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Return Items */}
        {invoice.return_items.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>Return Items ({invoice.return_items.length})</h3>
            <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {["Product", "Batch No", "Qty", "Unit Price", "Line Total"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.return_items.map((item, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text)" }}>{item.product_name}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-muted)" }}>{item.batch_number || "—"}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text)" }}>{item.quantity}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatAmount(item.unit_price)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-right" style={{ color: "var(--color-text)" }}>{formatAmount(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="flex flex-col items-end gap-1 text-sm">
          <div className="flex gap-3"><span style={{ color: "var(--color-text-muted)" }}>Total:</span><span className="font-semibold tabular-nums w-36 text-right" style={{ color: "var(--color-text)" }}>{formatAmount(invoice.total_amount)}</span></div>
          <div className="flex gap-3"><span style={{ color: "var(--color-text-muted)" }}>Return:</span><span className="font-semibold tabular-nums w-36 text-right" style={{ color: "var(--color-text)" }}>{formatAmount(invoice.return_amount)}</span></div>
          <div className="flex gap-3"><span style={{ color: "var(--color-text-muted)" }}>Net Payable:</span><span className="font-bold tabular-nums w-36 text-right text-base" style={{ color: "var(--color-text)" }}>{formatAmount(invoice.net_amount)}</span></div>
        </div>

        {/* Verify */}
        {invoice.status !== "VERIFIED" && canVerify && (
          <div className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Verifying posts all items to branch inventory and locks the invoice.</p>
            <Button variant="primary" size="sm" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} isLoading={verifyMutation.isPending} onClick={() => verifyMutation.mutate()}>Verify & Post</Button>
          </div>
        )}

        {/* Payments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Payments</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Paid: {formatAmount(invoice.paid_amount)} / {formatAmount(invoice.net_amount)}
                {balance > 0.001 && <span className="ml-2 text-amber-500 font-medium">Balance: {formatAmount(balance)}</span>}
              </p>
            </div>
            {invoice.payment_status !== "PAID" && invoice.net_amount > 0 && (
              <Button variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddingPayment((v) => !v)}>Add Payment</Button>
            )}
          </div>

          {addingPayment && (
            <form onSubmit={form.handleSubmit((v) => paymentMutation.mutate(v))} className="mb-4 p-4 rounded-lg border space-y-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                  <Controller name="payment_method" control={form.control} render={({ field }) => (
                    <select {...field} className="form-select w-full h-9 text-sm">
                      {PURCHASE_PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text)" }}>Reference</label>
                  <Input placeholder="Cheque/transfer ref" {...form.register("reference")} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAddingPayment(false)}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" isLoading={paymentMutation.isPending} leftIcon={<CreditCard className="w-3.5 h-3.5" />}>Record Payment</Button>
              </div>
            </form>
          )}

          {invoice.payment_entries.length > 0 ? (
            <div className="rounded-lg overflow-auto border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--color-surface-2)" }}>
                    {["Date", "Method", "Reference", "Amount"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.payment_entries.map((entry, idx) => (
                    <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{entry.payment_date}</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{PAYMENT_METHOD_LABEL[entry.payment_method] ?? entry.payment_method}</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{entry.reference || "—"}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>{formatAmount(entry.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 rounded-lg border border-dashed text-xs" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>No payments recorded yet</div>
          )}
        </div>

      </div>
    </Modal>
  );
}
