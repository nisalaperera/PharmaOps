"use client";

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Modal }    from "@/components/ui/Modal";
import { Button }   from "@/components/ui/Button";
import { Input }    from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiGet, apiPost } from "@/lib/api-client";
import { showToast }      from "@/lib/toast";
import { stockTransferSchema, type StockTransferFormValues } from "../schemas";
import type { Branch, Product, PaginatedResponse, StockTransfer } from "@/types";

interface StockTransferModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function StockTransferModal({ isOpen, onClose }: StockTransferModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<StockTransferFormValues>({
    resolver:      zodResolver(stockTransferSchema),
    defaultValues: {
      source_branch_id:      "",
      destination_branch_id: "",
      items:                 [{ product_id: "", product_name: "", batch_number: "", quantity: 1 }],
      notes:                 "",
    },
  });

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: "items",
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        source_branch_id:      "",
        destination_branch_id: "",
        items:                 [{ product_id: "", product_name: "", batch_number: "", quantity: 1 }],
        notes:                 "",
      });
    }
  }, [isOpen, reset]);

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { page_size: 100, is_active: "true" }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: productsData } = useQuery<PaginatedResponse<Product>>({
    queryKey:  ["products-all"],
    queryFn:   () => apiGet<PaginatedResponse<Product>>("/products", { page_size: 200, is_active: true }),
    staleTime: 5 * 60 * 1000,
  });

  const branches = branchesData?.data ?? [];
  const products = productsData?.data ?? [];

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));
  const productOptions = products.map((p) => ({ value: p.id, label: p.name }));

  const mutation = useMutation({
    mutationFn: (data: StockTransferFormValues) =>
      apiPost<StockTransfer>("/inventory/stock-transfers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      showToast("success", "Transfer Initiated", "Stock transfer request has been created.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Stock Transfer"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit((data) => mutation.mutate(data))}
            isLoading={mutation.isPending}
          >
            Initiate Transfer
          </Button>
        </>
      }
    >
      <div className="space-y-5">

        {/* Branches */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Controller
            name="source_branch_id"
            control={control}
            render={({ field }) => (
              <Autocomplete
                label="Source Branch"
                required
                options={branchOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder="Search source branch…"
                error={errors.source_branch_id?.message}
              />
            )}
          />
          <Controller
            name="destination_branch_id"
            control={control}
            render={({ field }) => (
              <Autocomplete
                label="Destination Branch"
                required
                options={branchOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder="Search destination branch…"
                error={errors.destination_branch_id?.message}
              />
            )}
          />
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Transfer Items
            </span>
            {errors.items?.root && (
              <p className="text-xs text-danger-500">{errors.items.root.message}</p>
            )}
          </div>

          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <div
              className="grid gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{
                background: "var(--color-table-header)",
                color: "var(--color-text-muted)",
                gridTemplateColumns: "2fr 1fr 80px 32px",
              }}
            >
              <span>Product</span>
              <span>Batch No.</span>
              <span className="text-right">Qty</span>
              <span />
            </div>

            {itemFields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-2 px-3 py-2 items-center border-t"
                style={{ borderColor: "var(--color-border)", gridTemplateColumns: "2fr 1fr 80px 32px" }}
              >
                {/* Product */}
                <Controller
                  name={`items.${index}.product_id`}
                  control={control}
                  render={({ field: f }) => (
                    <Autocomplete
                      options={productOptions}
                      value={f.value}
                      onChange={(id) => {
                        f.onChange(id);
                        const product = products.find((p) => p.id === id);
                        setValue(`items.${index}.product_name`, product?.name ?? "");
                      }}
                      placeholder="Search product…"
                      error={errors.items?.[index]?.product_id?.message}
                    />
                  )}
                />

                {/* Batch number */}
                <Input
                  placeholder="e.g. B2024-01"
                  error={errors.items?.[index]?.batch_number?.message}
                  {...register(`items.${index}.batch_number`)}
                />

                {/* Quantity */}
                <Controller
                  name={`items.${index}.quantity`}
                  control={control}
                  render={({ field: f }) => (
                    <input
                      type="number"
                      min={1}
                      className="form-input text-sm text-right"
                      value={f.value || ""}
                      onChange={(e) => f.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  )}
                />

                {/* Remove row */}
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={itemFields.length === 1}
                  className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => appendItem({ product_id: "", product_name: "", batch_number: "", quantity: 1 })}
            className="mt-2"
          >
            Add Item
          </Button>
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            rows={2}
            placeholder="Optional transfer notes…"
            className="form-input resize-none"
            {...register("notes")}
          />
        </div>

      </div>
    </Modal>
  );
}
