"use client";

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { Badge }   from "@/components/ui/Badge";
import { apiGet, apiPost } from "@/lib/api-client";
import { showToast }       from "@/lib/toast";
import { purchaseInvoiceCreateSchema, type PurchaseInvoiceCreateValues } from "../schemas";
import type { PurchaseInvoice, PurchaseOrder, PaginatedResponse } from "@/types";

interface PurchaseInvoiceModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function PurchaseInvoiceModal({ isOpen, onClose }: PurchaseInvoiceModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<PurchaseInvoiceCreateValues>({
    resolver:      zodResolver(purchaseInvoiceCreateSchema),
    defaultValues: {
      purchase_order_id:    "",
      branch_id:            "",
      supplier_id:          "",
      channel_id:           "",
      invoice_date:         "",
      supplier_invoice_ref: "",
      notes:                "",
      items:                [],
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name:    "items",
    keyName: "rhfKey",
  });

  const watchedPoId = form.watch("purchase_order_id");

  const { data: poData } = useQuery<PaginatedResponse<PurchaseOrder>>({
    queryKey: ["purchase-orders-receivable"],
    queryFn:  () => apiGet<PaginatedResponse<PurchaseOrder>>("/purchases/orders", {
      page_size: 200,
      sort_by:   "created_at",
      sort_dir:  "desc",
    }),
    enabled: isOpen,
    select:  (data) => ({
      ...data,
      data: data.data.filter((po) => po.status === "APPROVED" || po.status === "PARTIAL"),
    }),
  });

  const receivablePOs = poData?.data ?? [];

  useEffect(() => {
    if (!watchedPoId) {
      form.setValue("branch_id",   "");
      form.setValue("supplier_id", "");
      form.setValue("channel_id",  "");
      form.setValue("items",       []);
      return;
    }
    const selectedPO = receivablePOs.find((po) => po.id === watchedPoId);
    if (!selectedPO) return;
    form.setValue("branch_id",   selectedPO.branch_id);
    form.setValue("supplier_id", selectedPO.supplier_id);
    form.setValue("channel_id",  selectedPO.channel_id);
    form.setValue("items", selectedPO.items.map((item) => ({
      product_id:        item.product_id,
      product_name:      item.product_name,
      ordered_quantity:  item.quantity,
      received_quantity: item.quantity,
      batch_number:      "",
      expiry_date:       "",
      unit_price:        item.unit_price,
    })));
  }, [watchedPoId, receivablePOs.length]);

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      purchase_order_id:    "",
      branch_id:            "",
      supplier_id:          "",
      channel_id:           "",
      invoice_date:         "",
      supplier_invoice_ref: "",
      notes:                "",
      items:                [],
    });
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: (values: PurchaseInvoiceCreateValues) =>
      apiPost<PurchaseInvoice>("/purchases/invoices", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders-receivable"] });
      showToast("success", "Invoice Created", "Purchase invoice recorded and inventory updated.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const selectedPO = receivablePOs.find((po) => po.id === watchedPoId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Purchase Invoice" size="full">
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 sm:max-w-md">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Purchase Order <span className="text-danger-500">*</span>
            </label>
            <Controller
              name="purchase_order_id"
              control={form.control}
              render={({ field }) => (
                <select {...field} className="form-select w-full">
                  <option value="">Select an approved purchase order…</option>
                  {receivablePOs.map((po) => (
                    <option key={po.id} value={po.id}>
                      #{po.id.slice(0, 8).toUpperCase()} — {po.supplier_name} ({po.status})
                    </option>
                  ))}
                </select>
              )}
            />
            {form.formState.errors.purchase_order_id && (
              <p className="text-xs text-danger-500 mt-1">{form.formState.errors.purchase_order_id.message}</p>
            )}
          </div>

          {selectedPO && (
            <div
              className="sm:col-span-2 flex flex-wrap gap-3 px-3 py-2 rounded-lg text-xs"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
            >
              <span><strong style={{ color: "var(--color-text)" }}>Supplier:</strong> {selectedPO.supplier_name}</span>
              <span><strong style={{ color: "var(--color-text)" }}>Channel:</strong> {selectedPO.channel_name}</span>
              <span><strong style={{ color: "var(--color-text)" }}>Items:</strong> {selectedPO.items.length}</span>
              <span><strong style={{ color: "var(--color-text)" }}>PO Total:</strong> {selectedPO.total_amount.toFixed(2)}</span>
            </div>
          )}

          <input type="hidden" {...form.register("branch_id")} />
          <input type="hidden" {...form.register("supplier_id")} />
          <input type="hidden" {...form.register("channel_id")} />

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
              Supplier Invoice Ref
            </label>
            <Input
              placeholder="Supplier's invoice reference…"
              {...form.register("supplier_invoice_ref")}
            />
          </div>

          <div className="sm:col-span-2 sm:max-w-lg">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Notes</label>
            <textarea {...form.register("notes")} rows={2} placeholder="Optional notes…" className="form-input w-full resize-none" />
          </div>
        </div>

        {fields.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
              Receive Items ({fields.length})
            </h3>

            <div
              className="hidden sm:grid gap-3 px-3 pb-2 text-xs font-medium uppercase tracking-wide"
              style={{ gridTemplateColumns: "2fr 90px 110px 130px 130px 100px", color: "var(--color-text-muted)" }}
            >
              <span>Product</span><span>Ordered</span><span>Received</span>
              <span>Batch #</span><span>Expiry Date</span><span>Unit Price</span>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const orderedQty  = form.watch(`items.${index}.ordered_quantity`);
                const receivedQty = Number(form.watch(`items.${index}.received_quantity`)) || 0;
                const isPartial   = receivedQty < orderedQty;

                return (
                  <div
                    key={field.rhfKey}
                    className="rounded-lg border p-3"
                    style={{ borderColor: "var(--color-border)", background: isPartial ? "var(--color-surface-2)" : undefined }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <p className="text-sm font-semibold flex-1" style={{ color: "var(--color-text)" }}>
                        {form.watch(`items.${index}.product_name`)}
                      </p>
                      {isPartial && <Badge variant="warning">Partial</Badge>}
                    </div>

                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Ordered</label>
                        <div className="h-9 flex items-center px-2 rounded-md text-sm tabular-nums" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                          {orderedQty}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Received <span className="text-danger-500">*</span></label>
                        <Input type="number" min={0} max={orderedQty} {...form.register(`items.${index}.received_quantity`, { valueAsNumber: true })} error={form.formState.errors.items?.[index]?.received_quantity?.message} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Batch # <span className="text-danger-500">*</span></label>
                        <Input placeholder="e.g. BT-2024-001" {...form.register(`items.${index}.batch_number`)} error={form.formState.errors.items?.[index]?.batch_number?.message} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Expiry Date <span className="text-danger-500">*</span></label>
                        <Input type="date" {...form.register(`items.${index}.expiry_date`)} error={form.formState.errors.items?.[index]?.expiry_date?.message} />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Unit Price <span className="text-danger-500">*</span></label>
                        <Input type="number" min={0} step="0.01" {...form.register(`items.${index}.unit_price`, { valueAsNumber: true })} error={form.formState.errors.items?.[index]?.unit_price?.message} />
                      </div>
                    </div>

                    <input type="hidden" {...form.register(`items.${index}.product_id`)} />
                    <input type="hidden" {...form.register(`items.${index}.product_name`)} />
                    <input type="hidden" {...form.register(`items.${index}.ordered_quantity`)} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!watchedPoId && (
          <div className="text-center py-8 rounded-lg border border-dashed text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            Select a purchase order above to see its items
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending} disabled={!watchedPoId || fields.length === 0}>
            Create Invoice
          </Button>
        </div>
      </form>
    </Modal>
  );
}
