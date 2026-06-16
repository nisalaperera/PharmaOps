"use client";

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Modal }        from "@/components/ui/Modal";
import { Button }       from "@/components/ui/Button";
import { Input }        from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast }                 from "@/lib/toast";
import { useAuth }                   from "@/hooks/useAuth";
import {
  poCreateSchema, poEditSchema,
  type POCreateValues, type POEditValues,
} from "../schemas";
import type { PurchaseOrder, Supplier, Product, Branch, PaginatedResponse } from "@/types";

interface POModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  editingPO: PurchaseOrder | null;
}

const EMPTY_ITEM        = { product_id: "", product_name: "", sku: "", unit_quantity: 1, free_quantity: 0, discount: 0, unit_price: 0, line_total: 0 };
const EMPTY_RETURN_ITEM = { product_id: "", product_name: "", sku: "", unit_quantity: 1, free_quantity: 0, unit_price: 0, line_total: 0 };

export function POModal({ isOpen, onClose, editingPO }: POModalProps) {
  const { user, permissions } = useAuth();
  const queryClient = useQueryClient();
  const isEditing   = editingPO !== null;

  const form = useForm<POCreateValues>({
    resolver:      zodResolver(isEditing ? poEditSchema : poCreateSchema),
    defaultValues: {
      branch_id:    "",
      supplier_id:  "",
      channel_id:   "",
      order_date:   format(new Date(), "yyyy-MM-dd"),
      notes:        "",
      items:        [{ ...EMPTY_ITEM }],
      return_items: [],
    },
  });

  const {
    fields:       itemFields,
    append:       appendItem,
    remove:       removeItem,
  } = useFieldArray({ control: form.control, name: "items",        keyName: "rhfKey" });

  const {
    fields:       returnFields,
    append:       appendReturn,
    remove:       removeReturn,
  } = useFieldArray({ control: form.control, name: "return_items", keyName: "rhfKey" });

  const watchedSupplierId  = form.watch("supplier_id");
  const watchedItems       = form.watch("items");
  const watchedReturnItems = form.watch("return_items");

  // ── Data queries ─────────────────────────────────────────────────────────

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

  const branches        = branchesData?.data  ?? [];
  const suppliers       = suppliersData?.data  ?? [];
  const products        = productsData?.data   ?? [];
  const selectedSupplier = suppliers.find((s) => s.id === watchedSupplierId);
  const channelOptions   = selectedSupplier?.distributor_channels ?? [];

  // ── Reset on open ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      form.reset({
        branch_id:    editingPO.branch_id,
        supplier_id:  editingPO.supplier_id,
        channel_id:   editingPO.channel_id,
        order_date:   editingPO.order_date ?? format(new Date(), "yyyy-MM-dd"),
        notes:        editingPO.notes ?? "",
        items: editingPO.items.map((it) => ({
          product_id:    it.product_id,
          product_name:  it.product_name,
          sku:           it.sku ?? "",
          unit_quantity: it.unit_quantity,
          free_quantity: it.free_quantity ?? 0,
          discount:      it.discount      ?? 0,
          unit_price:    it.unit_price,
          line_total:    it.line_total    ?? 0,
        })),
        return_items: (editingPO.return_items ?? []).map((it) => ({
          product_id:    it.product_id,
          product_name:  it.product_name,
          sku:           it.sku ?? "",
          unit_quantity: it.unit_quantity,
          free_quantity: it.free_quantity ?? 0,
          unit_price:    it.unit_price,
          line_total:    it.line_total   ?? 0,
        })),
      });
    } else {
      form.reset({
        branch_id:    permissions?.isBranchLevel ? (user?.branchId ?? "") : "",
        supplier_id:  "",
        channel_id:   "",
        order_date:   format(new Date(), "yyyy-MM-dd"),
        notes:        "",
        items:        [{ ...EMPTY_ITEM }],
        return_items: [],
      });
    }
  }, [isOpen, editingPO]);

  useEffect(() => {
    if (!isEditing) form.setValue("channel_id", "");
  }, [watchedSupplierId]);

  // ── Item helpers ──────────────────────────────────────────────────────────

  function getProductSKUs(productId: string): string[] {
    const product = products.find((p) => p.id === productId);
    return (product?.sku_mappings ?? []).map((m: { sku: string }) => m.sku);
  }

  function handleItemProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    form.setValue(`items.${index}.product_id`,   productId);
    form.setValue(`items.${index}.product_name`, product?.name ?? "");
    form.setValue(`items.${index}.sku`,          "");
    recalcItemTotal(index);
  }

  function handleReturnProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    form.setValue(`return_items.${index}.product_id`,   productId);
    form.setValue(`return_items.${index}.product_name`, product?.name ?? "");
    form.setValue(`return_items.${index}.sku`,          "");
    recalcReturnTotal(index);
  }

  function recalcItemTotal(index: number) {
    const qty      = Number(form.getValues(`items.${index}.unit_quantity`)) || 0;
    const price    = Number(form.getValues(`items.${index}.unit_price`))    || 0;
    const discount = Number(form.getValues(`items.${index}.discount`))      || 0;
    form.setValue(`items.${index}.line_total`, qty * price - discount);
  }

  function recalcReturnTotal(index: number) {
    const qty   = Number(form.getValues(`return_items.${index}.unit_quantity`)) || 0;
    const price = Number(form.getValues(`return_items.${index}.unit_price`))    || 0;
    form.setValue(`return_items.${index}.line_total`, qty * price);
  }

  // ── Computed totals ───────────────────────────────────────────────────────

  const orderTotal = watchedItems.reduce((sum, item) => {
    const qty      = Number(item.unit_quantity) || 0;
    const price    = Number(item.unit_price)    || 0;
    const discount = Number(item.discount)      || 0;
    return sum + qty * price - discount;
  }, 0);

  const returnTotal = watchedReturnItems.reduce((sum, item) => {
    const qty   = Number(item.unit_quantity) || 0;
    const price = Number(item.unit_price)    || 0;
    return sum + qty * price;
  }, 0);

  // ── Submit ────────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (values: POCreateValues | POEditValues) =>
      isEditing
        ? apiPatch<PurchaseOrder>(`/purchases/orders/${editingPO!.id}`, values)
        : apiPost<PurchaseOrder>("/purchases/orders", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast(
        "success",
        isEditing ? "Purchase Order Updated" : "Purchase Order Created",
        isEditing ? "Changes saved successfully." : "Draft purchase order has been created.",
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function renderItemsHeader(columns: string[]) {
    return (
      <div
        className="grid gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide"
        style={{ gridTemplateColumns: "2fr 1fr 70px 70px 80px 100px 90px 28px", color: "var(--color-text-muted)" }}
      >
        {columns.map((h) => <span key={h}>{h}</span>)}
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Purchase Order" : "New Purchase Order"}
      size="full"
    >
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6">

        {/* ── Basic Info ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {permissions?.isOrgLevel ? (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Branch <span className="text-danger-500">*</span>
              </label>
              <Controller
                name="branch_id"
                control={form.control}
                render={({ field }) => (
                  <select {...field} className="form-select w-full">
                    <option value="">Select branch…</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              />
              {form.formState.errors.branch_id && (
                <p className="text-xs text-danger-500 mt-1">{form.formState.errors.branch_id.message}</p>
              )}
            </div>
          ) : (
            <input type="hidden" {...form.register("branch_id")} />
          )}

          <div>
            <Controller
              name="supplier_id"
              control={form.control}
              render={({ field }) => (
                <Autocomplete
                  label={<>Supplier <span className="text-danger-500">*</span></>}
                  value={field.value}
                  onChange={field.onChange}
                  options={suppliers.map((s) => ({ value: s.id, label: s.short_name }))}
                  placeholder="Search supplier…"
                  isLoading={isOpen && !suppliersData}
                  error={form.formState.errors.supplier_id?.message}
                />
              )}
            />
          </div>

          <div>
            <Controller
              name="channel_id"
              control={form.control}
              render={({ field }) => (
                <Autocomplete
                  label={<>Channel <span className="text-danger-500">*</span></>}
                  value={field.value}
                  onChange={field.onChange}
                  options={channelOptions.map((ch, idx) => ({ value: ch.id ?? String(idx), label: ch.channel_name }))}
                  placeholder={watchedSupplierId ? "Search channel…" : "Select supplier first"}
                  disabled={!watchedSupplierId}
                  error={form.formState.errors.channel_id?.message}
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Order Date <span className="text-danger-500">*</span>
            </label>
            <Input
              type="date"
              {...form.register("order_date")}
              error={form.formState.errors.order_date?.message}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>Notes</label>
            <textarea
              {...form.register("notes")}
              rows={2}
              placeholder="Optional notes…"
              className="form-input w-full resize-none"
            />
          </div>
        </div>

        {/* ── Order Items ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Order Items</h3>
              {typeof form.formState.errors.items?.message === "string" && (
                <p className="text-xs text-danger-500 mt-0.5">{form.formState.errors.items.message}</p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => appendItem({ ...EMPTY_ITEM })}>
              Add Item
            </Button>
          </div>

          {renderItemsHeader(["Product", "SKU", "Qty", "Free", "Disc.", "Unit Price", "Line Total", ""])}

          <div className="space-y-2">
            {itemFields.map((field, index) => {
              const item      = watchedItems[index] ?? {};
              const lineTotal = (Number(item.unit_quantity) || 0) * (Number(item.unit_price) || 0) - (Number(item.discount) || 0);
              const skuOptions = getProductSKUs(item.product_id ?? "");

              return (
                <div key={field.rhfKey} className="grid gap-2 items-start"
                  style={{ gridTemplateColumns: "2fr 1fr 70px 70px 80px 100px 90px 28px" }}>

                  <Autocomplete
                    value={form.watch(`items.${index}.product_id`)}
                    onChange={(pid) => handleItemProductSelect(index, pid)}
                    options={products.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Product…"
                    isLoading={isOpen && !productsData}
                    error={form.formState.errors.items?.[index]?.product_id?.message}
                  />

                  {/* SKU */}
                  <Controller
                    name={`items.${index}.sku`}
                    control={form.control}
                    render={({ field: f }) => (
                      skuOptions.length > 0 ? (
                        <select {...f} className="form-select h-9 text-xs">
                          <option value="">SKU…</option>
                          {skuOptions.map((sku) => <option key={sku} value={sku}>{sku}</option>)}
                        </select>
                      ) : (
                        <Input {...f} placeholder="SKU" />
                      )
                    )}
                  />

                  <Input type="number" min={1}
                    {...form.register(`items.${index}.unit_quantity`, { valueAsNumber: true })}
                    onChange={(e) => { form.setValue(`items.${index}.unit_quantity`, Number(e.target.value)); recalcItemTotal(index); }}
                    error={form.formState.errors.items?.[index]?.unit_quantity?.message}
                  />

                  <Input type="number" min={0}
                    {...form.register(`items.${index}.free_quantity`, { valueAsNumber: true })}
                  />

                  <Input type="number" min={0} step="0.01"
                    {...form.register(`items.${index}.discount`, { valueAsNumber: true })}
                    onChange={(e) => { form.setValue(`items.${index}.discount`, Number(e.target.value)); recalcItemTotal(index); }}
                  />

                  <Input type="number" min={0} step="0.01"
                    {...form.register(`items.${index}.unit_price`, { valueAsNumber: true })}
                    onChange={(e) => { form.setValue(`items.${index}.unit_price`, Number(e.target.value)); recalcItemTotal(index); }}
                    error={form.formState.errors.items?.[index]?.unit_price?.message}
                  />

                  <div className="h-9 flex items-center px-2 rounded-md text-sm tabular-nums"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                    {lineTotal.toFixed(2)}
                  </div>

                  <div className="flex items-center justify-center h-9">
                    {itemFields.length > 1 && (
                      <button type="button" onClick={() => removeItem(index)}
                        className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex justify-end items-center gap-3 pt-3 border-t text-sm"
            style={{ borderColor: "var(--color-border)" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Order Total:</span>
            <span className="font-bold tabular-nums text-base" style={{ color: "var(--color-text)" }}>
              LKR {orderTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ── Return Items ────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Return Items <span className="text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
            </h3>
            <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => appendReturn({ ...EMPTY_RETURN_ITEM })}>
              Add Return Item
            </Button>
          </div>

          {returnFields.length > 0 && (
            <>
              <div className="grid gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide"
                style={{ gridTemplateColumns: "2fr 1fr 70px 70px 100px 90px 28px", color: "var(--color-text-muted)" }}>
                {["Product", "SKU", "Qty", "Free", "Unit Price", "Line Total", ""].map((h) => <span key={h}>{h}</span>)}
              </div>

              <div className="space-y-2">
                {returnFields.map((field, index) => {
                  const item      = watchedReturnItems[index] ?? {};
                  const lineTotal = (Number(item.unit_quantity) || 0) * (Number(item.unit_price) || 0);
                  const skuOptions = getProductSKUs(item.product_id ?? "");

                  return (
                    <div key={field.rhfKey} className="grid gap-2 items-start"
                      style={{ gridTemplateColumns: "2fr 1fr 70px 70px 100px 90px 28px" }}>

                      <Autocomplete
                        value={form.watch(`return_items.${index}.product_id`)}
                        onChange={(pid) => handleReturnProductSelect(index, pid)}
                        options={products.map((p) => ({ value: p.id, label: p.name }))}
                        placeholder="Product…"
                        isLoading={isOpen && !productsData}
                        error={form.formState.errors.return_items?.[index]?.product_id?.message}
                      />

                      <Controller
                        name={`return_items.${index}.sku`}
                        control={form.control}
                        render={({ field: f }) => (
                          skuOptions.length > 0 ? (
                            <select {...f} className="form-select h-9 text-xs">
                              <option value="">SKU…</option>
                              {skuOptions.map((sku) => <option key={sku} value={sku}>{sku}</option>)}
                            </select>
                          ) : (
                            <Input {...f} placeholder="SKU" />
                          )
                        )}
                      />

                      <Input type="number" min={1}
                        {...form.register(`return_items.${index}.unit_quantity`, { valueAsNumber: true })}
                        onChange={(e) => { form.setValue(`return_items.${index}.unit_quantity`, Number(e.target.value)); recalcReturnTotal(index); }}
                        error={form.formState.errors.return_items?.[index]?.unit_quantity?.message}
                      />

                      <Input type="number" min={0}
                        {...form.register(`return_items.${index}.free_quantity`, { valueAsNumber: true })}
                      />

                      <Input type="number" min={0} step="0.01"
                        {...form.register(`return_items.${index}.unit_price`, { valueAsNumber: true })}
                        onChange={(e) => { form.setValue(`return_items.${index}.unit_price`, Number(e.target.value)); recalcReturnTotal(index); }}
                        error={form.formState.errors.return_items?.[index]?.unit_price?.message}
                      />

                      <div className="h-9 flex items-center px-2 rounded-md text-sm tabular-nums"
                        style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                        {lineTotal.toFixed(2)}
                      </div>

                      <div className="flex items-center justify-center h-9">
                        <button type="button" onClick={() => removeReturn(index)}
                          className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-end items-center gap-3 pt-3 border-t text-sm"
                style={{ borderColor: "var(--color-border)" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Return Total:</span>
                <span className="font-bold tabular-nums text-base" style={{ color: "var(--color-danger)" }}>
                  LKR {returnTotal.toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create Draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
