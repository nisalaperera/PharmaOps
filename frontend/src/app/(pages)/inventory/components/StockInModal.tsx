"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { Modal }       from "@/components/ui/Modal";
import { Button }      from "@/components/ui/Button";
import { Input }       from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiPost, apiGet } from "@/lib/api-client";
import { showToast }       from "@/lib/toast";
import type { InventoryItem, Product, PaginatedResponse } from "@/types";

const stockInSchema = z.object({
  product_id:     z.string().optional(),
  batch_number:   z.string().min(1, "Batch number is required"),
  expiry_date:    z.string().min(1, "Expiry date is required"),
  quantity:       z.number({ invalid_type_error: "Quantity is required" }).int().min(1, "Must be at least 1"),
  purchase_price: z.number({ invalid_type_error: "Purchase price is required" }).min(0, "Cannot be negative"),
  selling_price:  z.number({ invalid_type_error: "Selling price is required" }).min(0, "Cannot be negative"),
  notes:          z.string().optional().nullable(),
});

type StockInFormValues = z.infer<typeof stockInSchema>;

interface StockInModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  inventoryItem: InventoryItem | null;  // null = "free" mode from header button
}

export function StockInModal({ isOpen, onClose, inventoryItem }: StockInModalProps) {
  const queryClient = useQueryClient();
  const isFreeMode  = inventoryItem === null;

  const { register, handleSubmit, reset, control, formState: { errors } } =
    useForm<StockInFormValues>({
      resolver:      zodResolver(stockInSchema),
      defaultValues: {
        product_id: "", batch_number: "", expiry_date: "",
        quantity: 1, purchase_price: 0, selling_price: 0, notes: "",
      },
    });

  useEffect(() => {
    if (isOpen) {
      reset({
        product_id: "", batch_number: "", expiry_date: "",
        quantity: 1, purchase_price: 0, selling_price: 0, notes: "",
      });
    }
  }, [isOpen, reset]);

  // Load products only in free mode (header button)
  const { data: productsData } = useQuery<PaginatedResponse<Product>>({
    queryKey:  ["products-all"],
    queryFn:   () => apiGet<PaginatedResponse<Product>>("/products", { page_size: 200, is_active: true }),
    enabled:   isOpen && isFreeMode,
    staleTime: 5 * 60 * 1000,
  });
  const products        = productsData?.data ?? [];
  const productOptions  = products.map((p) => ({ value: p.id, label: p.name }));

  const mutation = useMutation({
    mutationFn: (data: StockInFormValues) => {
      if (isFreeMode) {
        return apiPost<InventoryItem>("/inventory/stock-in", {
          product_id:     data.product_id,
          batch_number:   data.batch_number,
          expiry_date:    data.expiry_date,
          quantity:       data.quantity,
          purchase_price: data.purchase_price,
          selling_price:  data.selling_price,
          notes:          data.notes,
        });
      }
      return apiPost<InventoryItem>(`/inventory/${inventoryItem!.id}/stock-in`, {
        batch_number:   data.batch_number,
        expiry_date:    data.expiry_date,
        quantity:       data.quantity,
        purchase_price: data.purchase_price,
        selling_price:  data.selling_price,
        notes:          data.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast(
        "success",
        "Stock Added",
        inventoryItem
          ? `Stock has been added to ${inventoryItem.product_name}.`
          : "Stock has been added successfully.",
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Stock In Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock In"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leftIcon={<PackagePlus className="w-4 h-4" />}
            onClick={handleSubmit((data) => mutation.mutate(data))}
            isLoading={mutation.isPending}
          >
            Add Stock
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Product — shown in row mode as label, in free mode as searchable dropdown */}
        {!isFreeMode ? (
          <div
            className="px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
          >
            {inventoryItem?.product_name}
          </div>
        ) : (
          <Controller
            name="product_id"
            control={control}
            render={({ field }) => (
              <Autocomplete
                label="Product"
                required
                options={productOptions}
                value={field.value ?? ""}
                onChange={field.onChange}
                placeholder="Search product…"
                error={errors.product_id?.message}
              />
            )}
          />
        )}

        {/* Batch + Expiry */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Batch Number"
            placeholder="e.g. B2024-001"
            required
            error={errors.batch_number?.message}
            {...register("batch_number")}
          />
          <Input
            label="Expiry Date"
            type="date"
            required
            error={errors.expiry_date?.message}
            {...register("expiry_date")}
          />
        </div>

        {/* Quantity */}
        <Controller
          name="quantity"
          control={control}
          render={({ field }) => (
            <Input
              label="Quantity"
              type="number"
              placeholder="e.g. 100"
              required
              error={errors.quantity?.message}
              value={field.value || ""}
              onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
            />
          )}
        />

        {/* Prices */}
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="purchase_price"
            control={control}
            render={({ field }) => (
              <Input
                label="Purchase Price"
                type="number"
                placeholder="0.00"
                required
                error={errors.purchase_price?.message}
                value={field.value === 0 ? "" : field.value}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
          <Controller
            name="selling_price"
            control={control}
            render={({ field }) => (
              <Input
                label="Selling Price"
                type="number"
                placeholder="0.00"
                required
                error={errors.selling_price?.message}
                value={field.value === 0 ? "" : field.value}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            rows={2}
            placeholder="Optional notes…"
            className="form-input resize-none"
            {...register("notes")}
          />
        </div>

      </div>
    </Modal>
  );
}
