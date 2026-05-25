"use client";

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast }                 from "@/lib/toast";
import { useAuth }                   from "@/hooks/useAuth";
import { poCreateSchema, poEditSchema, type POCreateValues, type POEditValues } from "../schemas";
import type { PurchaseOrder, Supplier, Product, Branch, PaginatedResponse } from "@/types";

interface POModalProps {
  isOpen:  boolean;
  onClose: () => void;
  editingPO: PurchaseOrder | null;
}

const EMPTY_ITEM = { product_id: "", product_name: "", quantity: 1, unit_price: 0, total_price: 0 };

export function POModal({ isOpen, onClose, editingPO }: POModalProps) {
  const { user, permissions } = useAuth();
  const queryClient = useQueryClient();
  const isEditing   = editingPO !== null;

  const form = useForm<POCreateValues>({
    resolver:      zodResolver(isEditing ? poEditSchema : poCreateSchema),
    defaultValues: {
      branch_id:   "",
      supplier_id: "",
      channel_id:  "",
      notes:       "",
      items:       [{ ...EMPTY_ITEM }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name:    "items",
    keyName: "rhfKey",
  });

  // Watch supplier to update channel options
  const watchedSupplierId = form.watch("supplier_id");

  // ── Supplementary data queries ────────────────────────────────────────────

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

  const branches  = branchesData?.data  ?? [];
  const suppliers = suppliersData?.data  ?? [];
  const products  = productsData?.data   ?? [];

  const selectedSupplier  = suppliers.find((s) => s.id === watchedSupplierId);
  const channelOptions    = selectedSupplier?.distributor_channels ?? [];

  // ── Reset form on open ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      form.reset({
        branch_id:   editingPO.branch_id,
        supplier_id: editingPO.supplier_id,
        channel_id:  editingPO.channel_id,
        notes:       editingPO.notes ?? "",
        items:       editingPO.items.map((it) => ({
          product_id:   it.product_id,
          product_name: it.product_name,
          quantity:     it.quantity,
          unit_price:   it.unit_price,
          total_price:  it.total_price,
        })),
      });
    } else {
      form.reset({
        branch_id:   permissions?.isBranchLevel ? (user?.branchId ?? "") : "",
        supplier_id: "",
        channel_id:  "",
        notes:       "",
        items:       [{ ...EMPTY_ITEM }],
      });
    }
  }, [isOpen, editingPO]);

  // When supplier changes, clear channel selection
  useEffect(() => {
    if (!isEditing) {
      form.setValue("channel_id", "");
    }
  }, [watchedSupplierId]);

  // ── Item helpers ──────────────────────────────────────────────────────────

  function handleProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    form.setValue(`items.${index}.product_id`,   productId);
    form.setValue(`items.${index}.product_name`, product?.name ?? "");
    recalcTotal(index);
  }

  function recalcTotal(index: number) {
    const qty   = Number(form.getValues(`items.${index}.quantity`))   || 0;
    const price = Number(form.getValues(`items.${index}.unit_price`)) || 0;
    form.setValue(`items.${index}.total_price`, qty * price);
  }

  // ── Submission ────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (values: POCreateValues | POEditValues) =>
      isEditing
        ? apiPatch<PurchaseOrder>(`/purchase-orders/${editingPO!.id}`, values)
        : apiPost<PurchaseOrder>("/purchase-orders", values),
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
      showToast(
        "error",
        isEditing ? "Update Failed" : "Create Failed",
        err?.message ?? "Something went wrong. Please try again.",
      );
    },
  });

  // ── Computed order total ──────────────────────────────────────────────────
  const watchedItems = form.watch("items");
  const orderTotal   = watchedItems.reduce((sum, item) => {
    const qty   = Number(item.quantity)   || 0;
    const price = Number(item.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Purchase Order" : "New Purchase Order"}
      size="full"
    >
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">

        {/* ── Basic Info ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Branch — org-level users see a select, branch users see read-only */}
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
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              />
              {form.formState.errors.branch_id && (
                <p className="text-xs text-danger-500 mt-1">
                  {form.formState.errors.branch_id.message}
                </p>
              )}
            </div>
          ) : (
            <input type="hidden" {...form.register("branch_id")} />
          )}

          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Supplier <span className="text-danger-500">*</span>
            </label>
            <Controller
              name="supplier_id"
              control={form.control}
              render={({ field }) => (
                <select
                  {...field}
                  className="form-select w-full"
                  onChange={(e) => { field.onChange(e); }}
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.short_name}</option>
                  ))}
                </select>
              )}
            />
            {form.formState.errors.supplier_id && (
              <p className="text-xs text-danger-500 mt-1">
                {form.formState.errors.supplier_id.message}
              </p>
            )}
          </div>

          {/* Channel — depends on selected supplier */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Channel <span className="text-danger-500">*</span>
            </label>
            <Controller
              name="channel_id"
              control={form.control}
              render={({ field }) => (
                <select
                  {...field}
                  className="form-select w-full"
                  disabled={channelOptions.length === 0}
                >
                  <option value="">
                    {watchedSupplierId ? "Select channel…" : "Select supplier first"}
                  </option>
                  {channelOptions.map((ch, idx) => (
                    <option key={ch.id ?? idx} value={ch.id ?? String(idx)}>
                      {ch.channel_name}
                    </option>
                  ))}
                </select>
              )}
            />
            {form.formState.errors.channel_id && (
              <p className="text-xs text-danger-500 mt-1">
                {form.formState.errors.channel_id.message}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Notes
            </label>
            <textarea
              {...form.register("notes")}
              rows={2}
              placeholder="Optional notes for this order…"
              className="form-input w-full resize-none"
            />
          </div>
        </div>

        {/* ── Items ───────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Order Items
              </h3>
              {typeof form.formState.errors.items?.message === "string" && (
                <p className="text-xs text-danger-500 mt-0.5">
                  {form.formState.errors.items.message}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => append({ ...EMPTY_ITEM })}
            >
              Add Item
            </Button>
          </div>

          {/* Items table header */}
          <div
            className="grid gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide"
            style={{
              gridTemplateColumns: "2fr 80px 110px 100px 32px",
              color: "var(--color-text-muted)",
            }}
          >
            <span>Product</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Total</span>
            <span />
          </div>

          <div className="space-y-2">
            {fields.map((field, index) => {
              const qty   = Number(watchedItems[index]?.quantity)   || 0;
              const price = Number(watchedItems[index]?.unit_price) || 0;
              const total = qty * price;

              return (
                <div
                  key={field.rhfKey}
                  className="grid gap-2 items-start"
                  style={{ gridTemplateColumns: "2fr 80px 110px 100px 32px" }}
                >
                  {/* Product select */}
                  <div>
                    <select
                      className="form-select w-full text-sm"
                      value={form.watch(`items.${index}.product_id`)}
                      onChange={(e) => handleProductSelect(index, e.target.value)}
                    >
                      <option value="">Select product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.items?.[index]?.product_id && (
                      <p className="text-xs text-danger-500 mt-0.5">
                        {form.formState.errors.items[index]?.product_id?.message}
                      </p>
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                      onChange={(e) => {
                        form.setValue(`items.${index}.quantity`, Number(e.target.value));
                        recalcTotal(index);
                      }}
                      error={form.formState.errors.items?.[index]?.quantity?.message}
                    />
                  </div>

                  {/* Unit Price */}
                  <div>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      {...form.register(`items.${index}.unit_price`, { valueAsNumber: true })}
                      onChange={(e) => {
                        form.setValue(`items.${index}.unit_price`, Number(e.target.value));
                        recalcTotal(index);
                      }}
                      error={form.formState.errors.items?.[index]?.unit_price?.message}
                    />
                  </div>

                  {/* Total (read-only) */}
                  <div
                    className="h-9 flex items-center px-2 rounded-md text-sm tabular-nums"
                    style={{
                      background: "var(--color-surface-2)",
                      color:      "var(--color-text-muted)",
                    }}
                  >
                    {total.toFixed(2)}
                  </div>

                  {/* Remove button */}
                  <div className="flex items-center justify-center h-9">
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Order total */}
          <div
            className="mt-3 flex justify-end items-center gap-3 pt-3 border-t text-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>Order Total:</span>
            <span className="font-bold tabular-nums text-base" style={{ color: "var(--color-text)" }}>
              {orderTotal.toFixed(2)}
            </span>
          </div>
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
