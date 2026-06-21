"use client";

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { Modal }        from "@/components/ui/Modal";
import { Button }       from "@/components/ui/Button";
import { Input }        from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast }                 from "@/lib/toast";
import { formatAmount }              from "@/lib/utils";
import { useAuth }                   from "@/hooks/useAuth";
import { PURCHASE_INVOICE_STATUS_OPTIONS } from "@/lib/constants";
import { purchaseInvoiceSchema, type PurchaseInvoiceValues } from "../schemas";
import type {
  PurchaseInvoice, PurchaseOrder, Supplier, Product, Branch, PaginatedResponse,
} from "@/types";

interface PurchaseInvoiceModalProps {
  isOpen:       boolean;
  onClose:      () => void;
  editing:      PurchaseInvoice | null;
  defaultPOId?: string | null;
}

const EMPTY_ITEM = {
  product_id: "", product_name: "", sku: "", batch_number: "",
  expiry_date: "", unit_quantity: 1, free_quantity: 0, discount: 0, unit_price: 0, selling_price: 0,
};
const EMPTY_RETURN = { product_id: "", product_name: "", batch_number: "", quantity: 1, unit_price: 0 };

export function PurchaseInvoiceModal({ isOpen, onClose, editing, defaultPOId }: PurchaseInvoiceModalProps) {
  const { user, permissions } = useAuth();
  const queryClient = useQueryClient();
  const isEditing   = editing !== null;

  const form = useForm<PurchaseInvoiceValues>({
    resolver:      zodResolver(purchaseInvoiceSchema),
    defaultValues: {
      branch_id: "", supplier_id: "", channel_id: "",
      invoice_date: format(new Date(), "yyyy-MM-dd"),
      purchase_order_id: "", distributor_invoice_no: "", distributor_invoice_date: "",
      status: "RECEIVED", items: [], return_items: [],
      manual_total_amount: 0, manual_return_amount: 0, notes: "",
    },
  });

  const itemsArray = useFieldArray({ control: form.control, name: "items",        keyName: "rhfKey" });
  const retsArray  = useFieldArray({ control: form.control, name: "return_items", keyName: "rhfKey" });

  const watchedSupplierId = form.watch("supplier_id");
  const watchedPoId       = form.watch("purchase_order_id");

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches-select"],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { page_size: 200 }),
    enabled:  isOpen && (permissions?.isOrgLevel ?? false),
  });
  const { data: suppliersData } = useQuery<PaginatedResponse<Supplier>>({
    queryKey: ["suppliers-select"],
    queryFn:  () => apiGet<PaginatedResponse<Supplier>>("/suppliers", { is_active: "true", supplier_type: "DISTRIBUTOR", page_size: 200 }),
    enabled:  isOpen,
  });
  const { data: productsData } = useQuery<PaginatedResponse<Product>>({
    queryKey: ["products-select"],
    queryFn:  () => apiGet<PaginatedResponse<Product>>("/products", { is_active: "true", page_size: 500 }),
    enabled:  isOpen,
  });
  const { data: poData } = useQuery<PaginatedResponse<PurchaseOrder>>({
    queryKey: ["purchase-orders-convertible"],
    queryFn:  () => apiGet<PaginatedResponse<PurchaseOrder>>("/purchases/orders", { page_size: 200, sort_by: "created_at", sort_dir: "desc" }),
    enabled:  isOpen && !isEditing,
    select:   (d) => ({ ...d, data: d.data.filter((po) => po.status === "APPROVED" || po.status === "SENT") }),
  });

  const branches    = branchesData?.data  ?? [];
  const suppliers   = suppliersData?.data  ?? [];
  const products    = productsData?.data   ?? [];
  const convertePOs = poData?.data         ?? [];

  const selectedSupplier = suppliers.find((s) => s.id === watchedSupplierId);
  const channelOptions   = selectedSupplier?.distributor_channels ?? [];

  // ── Reset on open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (isEditing && editing) {
      form.reset({
        branch_id:                editing.branch_id,
        supplier_id:              editing.supplier_id,
        channel_id:               editing.channel_id,
        invoice_date:             editing.invoice_date?.slice(0, 10) ?? format(new Date(), "yyyy-MM-dd"),
        purchase_order_id:        editing.purchase_order_id ?? "",
        distributor_invoice_no:   editing.distributor_invoice_no ?? "",
        distributor_invoice_date: editing.distributor_invoice_date?.slice(0, 10) ?? "",
        status:                   editing.status,
        items:                    editing.items.map((it) => ({ ...it })),
        return_items:             editing.return_items.map((it) => ({ ...it })),
        manual_total_amount:      editing.items.length        ? 0 : editing.total_amount,
        manual_return_amount:     editing.return_items.length ? 0 : editing.return_amount,
        notes:                    editing.notes ?? "",
      });
    } else {
      form.reset({
        branch_id: permissions?.isBranchLevel ? (user?.branchId ?? "") : "",
        supplier_id: "", channel_id: "",
        invoice_date: format(new Date(), "yyyy-MM-dd"),
        purchase_order_id: defaultPOId ?? "", distributor_invoice_no: "", distributor_invoice_date: "",
        status: "RECEIVED", items: [], return_items: [],
        manual_total_amount: 0, manual_return_amount: 0, notes: "",
      });
    }
  }, [isOpen, editing]);

  // Clear channel when distributor changes (create only)
  useEffect(() => {
    if (isOpen && !isEditing) form.setValue("channel_id", "");
  }, [watchedSupplierId]);

  // Populate from selected PO (create only)
  useEffect(() => {
    if (!isOpen || isEditing || !watchedPoId) return;
    const po = convertePOs.find((p) => p.id === watchedPoId);
    if (!po) return;
    form.setValue("branch_id",   po.branch_id);
    form.setValue("supplier_id", po.supplier_id);
    form.setValue("channel_id",  po.channel_id);
    form.setValue("items", po.items.map((it) => ({
      ...EMPTY_ITEM,
      product_id: it.product_id, product_name: it.product_name,
      unit_quantity: it.unit_quantity, unit_price: it.unit_price,
    })));
  }, [watchedPoId, convertePOs.length]);

  // ── Item helpers ──────────────────────────────────────────────────────────
  function handleProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    form.setValue(`items.${index}.product_id`,   productId);
    form.setValue(`items.${index}.product_name`, product?.name ?? "");
  }
  function handleReturnProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    form.setValue(`return_items.${index}.product_id`,   productId);
    form.setValue(`return_items.${index}.product_name`, product?.name ?? "");
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const watchedItems   = form.watch("items");
  const watchedReturns = form.watch("return_items");
  const manualTotal    = Number(form.watch("manual_total_amount"))  || 0;
  const manualReturn   = Number(form.watch("manual_return_amount")) || 0;

  const computedTotal = watchedItems.reduce(
    (s, it) => s + ((Number(it.unit_quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)),
    0,
  );
  const computedReturn = watchedReturns.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  );
  const totalAmount  = watchedItems.length   ? computedTotal  : manualTotal;
  const returnAmount = watchedReturns.length ? computedReturn : manualReturn;
  const netAmount    = totalAmount - returnAmount;

  // ── Submit ────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (values: PurchaseInvoiceValues) => {
      const payload = {
        ...values,
        purchase_order_id:        values.purchase_order_id || null,
        distributor_invoice_no:   values.distributor_invoice_no || null,
        distributor_invoice_date: values.distributor_invoice_date || null,
        manual_total_amount:      values.items.length        ? null : (values.manual_total_amount  ?? 0),
        manual_return_amount:     values.return_items.length ? null : (values.manual_return_amount ?? 0),
      };
      return isEditing
        ? apiPatch<PurchaseInvoice>(`/purchases/invoices/${editing!.id}`, payload)
        : apiPost<PurchaseInvoice>("/purchases/invoices", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast(
        "success",
        isEditing ? "Invoice Updated" : "Invoice Created",
        isEditing ? "Purchase invoice changes saved." : "Purchase invoice recorded successfully.",
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Purchase Invoice" : "New Purchase Invoice"} size="full">
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">

        {/* ── Convert from PO (create only) ──────────────────────────────────── */}
        {!isEditing && (
          <div className="sm:max-w-md">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Convert from Purchase Order <span className="text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
            </label>
            <Controller
              name="purchase_order_id"
              control={form.control}
              render={({ field }) => (
                <select {...field} value={field.value ?? ""} className="form-select w-full">
                  <option value="">Create blank invoice…</option>
                  {convertePOs.map((po) => (
                    <option key={po.id} value={po.id}>
                      #{po.id.slice(0, 8).toUpperCase()} — {po.supplier_name} ({po.status})
                    </option>
                  ))}
                </select>
              )}
            />
          </div>
        )}

        {/* ── Header info ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {permissions?.isOrgLevel ? (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Branch <span className="text-danger-500">*</span></label>
              <Controller name="branch_id" control={form.control} render={({ field }) => (
                <select {...field} className="form-select w-full">
                  <option value="">Select branch…</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )} />
              {form.formState.errors.branch_id && <p className="text-xs text-danger-500 mt-1">{form.formState.errors.branch_id.message}</p>}
            </div>
          ) : <input type="hidden" {...form.register("branch_id")} />}

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Invoice Date <span className="text-danger-500">*</span></label>
            <Input type="date" {...form.register("invoice_date")} error={form.formState.errors.invoice_date?.message} />
          </div>

          <div>
            <Controller name="supplier_id" control={form.control} render={({ field }) => (
              <Autocomplete
                label={<>Distributor <span className="text-danger-500">*</span></>}
                value={field.value}
                onChange={field.onChange}
                options={suppliers.map((s) => ({ value: s.id, label: s.short_name }))}
                placeholder="Search distributor…"
                isLoading={isOpen && !suppliersData}
                error={form.formState.errors.supplier_id?.message}
              />
            )} />
          </div>

          <div>
            <Controller name="channel_id" control={form.control} render={({ field }) => (
              <Autocomplete
                label={<>Distributor Channel <span className="text-danger-500">*</span></>}
                value={field.value}
                onChange={field.onChange}
                options={channelOptions.map((ch, idx) => ({ value: ch.id ?? String(idx), label: ch.channel_name }))}
                placeholder={watchedSupplierId ? "Search channel…" : "Select distributor first"}
                disabled={!watchedSupplierId}
                error={form.formState.errors.channel_id?.message}
              />
            )} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Distributor Invoice No</label>
            <Input placeholder="Supplier's invoice no…" {...form.register("distributor_invoice_no")} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Distributor Invoice Date</label>
            <Input type="date" {...form.register("distributor_invoice_date")} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Status <span className="text-danger-500">*</span></label>
            <select {...form.register("status")} className="form-select w-full">
              {PURCHASE_INVOICE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Verified posts items to inventory.</p>
          </div>
        </div>

        {/* ── Invoice Items ──────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Invoice Items</h3>
            <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => itemsArray.append({ ...EMPTY_ITEM })}>Add Item</Button>
          </div>

          {itemsArray.fields.length > 0 && (
            <>
              <div className="hidden lg:grid gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide"
                   style={{ gridTemplateColumns: "1.5fr 80px 80px 64px 56px 64px 80px 80px 80px 32px", color: "var(--color-text-muted)" }}>
                <span>Product</span><span>Batch No</span><span>SKU</span><span>Unit Qty</span><span>Free</span><span>Disc.</span><span>Unit Price</span><span>Sell Price</span><span>Line Total</span><span />
              </div>
              <div className="space-y-2">
                {itemsArray.fields.map((field, index) => {
                  const it    = watchedItems[index];
                  const line  = (Number(it?.unit_quantity) || 0) * (Number(it?.unit_price) || 0) - (Number(it?.discount) || 0);
                  const errs  = form.formState.errors.items?.[index];
                  return (
                    <div key={field.rhfKey} className="grid gap-2 items-start"
                         style={{ gridTemplateColumns: "1.5fr 80px 80px 64px 56px 64px 80px 80px 80px 32px" }}>
                      <Autocomplete
                        value={form.watch(`items.${index}.product_id`)}
                        onChange={(pid) => handleProductSelect(index, pid)}
                        options={products.map((p) => ({ value: p.id, label: p.name }))}
                        placeholder="Search product…"
                        error={errs?.product_id?.message}
                      />
                      <Input placeholder="Batch" {...form.register(`items.${index}.batch_number`)} error={errs?.batch_number?.message} />
                      <Input placeholder="SKU" {...form.register(`items.${index}.sku`)} />
                      <Input type="number" min={1} {...form.register(`items.${index}.unit_quantity`, { valueAsNumber: true })} error={errs?.unit_quantity?.message} />
                      <Input type="number" min={0} {...form.register(`items.${index}.free_quantity`, { valueAsNumber: true })} />
                      <Input type="number" min={0} step="0.01" {...form.register(`items.${index}.discount`, { valueAsNumber: true })} />
                      <Input type="number" min={0} step="0.01" {...form.register(`items.${index}.unit_price`, { valueAsNumber: true })} error={errs?.unit_price?.message} />
                      <Input type="number" min={0} step="0.01" {...form.register(`items.${index}.selling_price`, { valueAsNumber: true })} />
                      <div className="h-9 flex items-center justify-end px-2 rounded-md text-sm tabular-nums" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>{formatAmount(line)}</div>
                      <div className="flex items-center justify-center h-9">
                        <button type="button" onClick={() => itemsArray.remove(index)} className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      {/* expiry on its own row beneath */}
                      <div className="lg:col-span-10">
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Expiry:</span>
                          <Input type="date" className="max-w-[180px]" {...form.register(`items.${index}.expiry_date`)} error={errs?.expiry_date?.message} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Manual total when no items */}
          {itemsArray.fields.length === 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-3" style={{ borderColor: "var(--color-border)" }}>
              <label className="text-sm" style={{ color: "var(--color-text-muted)" }}>No items — enter Total Amount (LKR):</label>
              <Input type="number" min={0} step="0.01" className="max-w-[200px] text-right" {...form.register("manual_total_amount", { valueAsNumber: true })} error={form.formState.errors.manual_total_amount?.message} />
            </div>
          )}
        </div>

        {/* ── Return Items ───────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Return Items</h3>
            <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => retsArray.append({ ...EMPTY_RETURN })}>Add Return</Button>
          </div>

          {retsArray.fields.length > 0 && (
            <div className="space-y-2">
              <div className="hidden sm:grid gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide" style={{ gridTemplateColumns: "1.8fr 110px 90px 110px 110px 32px", color: "var(--color-text-muted)" }}>
                <span>Product</span><span>Batch No</span><span>Qty</span><span>Unit Price</span><span>Line Total</span><span />
              </div>
              {retsArray.fields.map((field, index) => {
                const ri   = watchedReturns[index];
                const line = (Number(ri?.quantity) || 0) * (Number(ri?.unit_price) || 0);
                const errs = form.formState.errors.return_items?.[index];
                return (
                  <div key={field.rhfKey} className="grid gap-2 items-start" style={{ gridTemplateColumns: "1.8fr 110px 90px 110px 110px 32px" }}>
                    <Autocomplete
                      value={form.watch(`return_items.${index}.product_id`)}
                      onChange={(pid) => handleReturnProductSelect(index, pid)}
                      options={products.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="Search product…"
                      error={errs?.product_id?.message}
                    />
                    <Input placeholder="Batch" {...form.register(`return_items.${index}.batch_number`)} />
                    <Input type="number" min={1} {...form.register(`return_items.${index}.quantity`, { valueAsNumber: true })} error={errs?.quantity?.message} />
                    <Input type="number" min={0} step="0.01" {...form.register(`return_items.${index}.unit_price`, { valueAsNumber: true })} error={errs?.unit_price?.message} />
                    <div className="h-9 flex items-center justify-end px-2 rounded-md text-sm tabular-nums" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>{formatAmount(line)}</div>
                    <div className="flex items-center justify-center h-9">
                      <button type="button" onClick={() => retsArray.remove(index)} className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {retsArray.fields.length === 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-3" style={{ borderColor: "var(--color-border)" }}>
              <label className="text-sm" style={{ color: "var(--color-text-muted)" }}>No return items — enter Return Amount (LKR):</label>
              <Input type="number" min={0} step="0.01" className="max-w-[200px] text-right" {...form.register("manual_return_amount", { valueAsNumber: true })} />
            </div>
          )}
        </div>

        {/* ── Summary ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-end gap-1 pt-3 border-t text-sm" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex gap-3"><span style={{ color: "var(--color-text-muted)" }}>Total:</span><span className="font-semibold tabular-nums w-32 text-right" style={{ color: "var(--color-text)" }}>{formatAmount(totalAmount)}</span></div>
          <div className="flex gap-3"><span style={{ color: "var(--color-text-muted)" }}>Return:</span><span className="font-semibold tabular-nums w-32 text-right" style={{ color: "var(--color-text)" }}>{formatAmount(returnAmount)}</span></div>
          <div className="flex gap-3"><span style={{ color: "var(--color-text-muted)" }}>Net Payable:</span><span className="font-bold tabular-nums w-32 text-right text-base text-primary-500">{formatAmount(netAmount)}</span></div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Notes</label>
          <textarea {...form.register("notes")} rows={2} placeholder="Optional notes…" className="form-input w-full resize-none" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>{isEditing ? "Save Changes" : "Create Invoice"}</Button>
        </div>
      </form>
    </Modal>
  );
}
