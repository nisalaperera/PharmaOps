"use client";

import { useEffect }              from "react";
import { useForm, Controller }    from "react-hook-form";
import { zodResolver }            from "@hookform/resolvers/zod";
import { z }                      from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus }            from "lucide-react";
import { Modal }                  from "@/components/ui/Modal";
import { Button }                 from "@/components/ui/Button";
import { Input }                  from "@/components/ui/Input";
import { Autocomplete }           from "@/components/ui/Autocomplete";
import { apiPost, apiGet }        from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { useAuth }                from "@/hooks/useAuth";
import type { InventoryItem, Product, Branch, PaginatedResponse } from "@/types";

const stockInSchema = z.object({
  branch_id:      z.string().optional(),
  product_id:     z.string().optional(),
  sku:            z.string().min(1, "SKU is required"),
  batch_number:   z.string().min(1, "Batch number is required"),
  expiry_date:    z.string().min(1, "Expiry date is required"),
  quantity:       z.number({ invalid_type_error: "Quantity is required" }).int().min(1, "Must be at least 1"),
  profit_margin:  z.number().min(0).max(9999).optional().nullable(),
  purchase_price: z.number({ invalid_type_error: "Purchase price is required" }).min(0, "Cannot be negative"),
  selling_price:  z.number({ invalid_type_error: "Selling price is required" }).min(0, "Cannot be negative"),
  notes:          z.string().optional().nullable(),
});

type StockInFormValues = z.infer<typeof stockInSchema>;

interface StockInModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  inventoryItem: InventoryItem | null;
}

export function StockInModal({ isOpen, onClose, inventoryItem }: StockInModalProps) {
  const queryClient     = useQueryClient();
  const { permissions } = useAuth();
  const isFreeMode      = inventoryItem === null;
  const isOrgLevel      = permissions?.isOrgLevel ?? false;
  const showBranchField = isFreeMode && isOrgLevel;

  const {
    register, handleSubmit, reset, control, watch, setValue, setError,
    formState: { errors },
  } = useForm<StockInFormValues>({
    resolver:      zodResolver(stockInSchema),
    defaultValues: {
      branch_id: "", product_id: "", sku: "", batch_number: "", expiry_date: "",
      quantity: 1, profit_margin: null, purchase_price: 0, selling_price: 0, notes: "",
    },
  });

  const watchedProductId     = watch("product_id");
  const watchedSellingPrice  = watch("selling_price");
  const watchedPurchasePrice = watch("purchase_price");
  const watchedProfitMargin  = watch("profit_margin");

  // ── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      reset({
        branch_id: "", product_id: "", sku: "", batch_number: "", expiry_date: "",
        quantity: 1, profit_margin: null, purchase_price: 0, selling_price: 0, notes: "",
      });
    }
  }, [isOpen, reset]);

  // ── Data queries ───────────────────────────────────────────────────────────

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-select"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 200 }),
    enabled:   isOpen && showBranchField,
    staleTime: 5 * 60 * 1000,
  });
  const branchOptions = (branchesData?.data ?? []).map((b) => ({ value: b.id, label: b.name }));

  const { data: productsData } = useQuery<PaginatedResponse<Product>>({
    queryKey:  ["products-all"],
    queryFn:   () => apiGet<PaginatedResponse<Product>>("/products", { page_size: 500, is_active: true }),
    enabled:   isOpen && isFreeMode,
    staleTime: 5 * 60 * 1000,
  });
  const productOptions = (productsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  // Load selected product for SKU options — works in both free and row modes
  const productIdForSku = isFreeMode ? (watchedProductId ?? "") : (inventoryItem?.product_id ?? "");

  const { data: selectedProduct } = useQuery<Product>({
    queryKey:  ["product", productIdForSku],
    queryFn:   () => apiGet<Product>(`/products/${productIdForSku}`),
    enabled:   isOpen && !!productIdForSku,
    staleTime: 5 * 60 * 1000,
  });

  // ── SKU options from selected product ─────────────────────────────────────

  const skuOptions = selectedProduct
    ? [
        { value: selectedProduct.basic_sku_name, label: selectedProduct.basic_sku_name },
        ...selectedProduct.sku_mappings.map((m) => ({
          value: m.sku,
          label: `${m.sku} (1 ${m.sku} = ${m.mapped_sku_count} ${selectedProduct.basic_sku_name})`,
        })),
      ]
    : [];

  // Auto-select base SKU when product loads or changes
  useEffect(() => {
    if (selectedProduct) {
      setValue("sku", selectedProduct.basic_sku_name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.id]);

  // ── Price / margin calculation handlers ────────────────────────────────────
  // Gross margin %: PM = (SP - PP) / SP × 100  →  PP = SP × (1 - PM / 100)

  function handleSellingPriceChange(value: number) {
    setValue("selling_price", value, { shouldValidate: true });
    const pm = watchedProfitMargin;
    const pp = watchedPurchasePrice ?? 0;
    if (pm != null && value > 0) {
      setValue("purchase_price", parseFloat((value * (1 - pm / 100)).toFixed(2)));
    } else if (pp > 0 && value > 0) {
      setValue("profit_margin", parseFloat(((value - pp) / value * 100).toFixed(2)));
    }
  }

  function handleProfitMarginChange(rawValue: string) {
    const parsed = parseFloat(rawValue);
    const value  = isNaN(parsed) ? null : parsed;
    setValue("profit_margin", value);
    const sp = watchedSellingPrice ?? 0;
    if (value != null && sp > 0) {
      setValue("purchase_price", parseFloat((sp * (1 - value / 100)).toFixed(2)));
    }
  }

  function handlePurchasePriceChange(value: number) {
    setValue("purchase_price", value, { shouldValidate: true });
    const sp = watchedSellingPrice ?? 0;
    if (sp > 0 && value > 0) {
      setValue("profit_margin", parseFloat(((sp - value) / sp * 100).toFixed(2)));
    }
  }

  // ── Mutation ──────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (data: StockInFormValues) => {
      if (isFreeMode) {
        return apiPost<InventoryItem>("/inventory/stock-in", {
          branch_id:      data.branch_id || undefined,
          product_id:     data.product_id,
          sku:            data.sku,
          batch_number:   data.batch_number,
          expiry_date:    data.expiry_date,
          quantity:       data.quantity,
          purchase_price: data.purchase_price,
          selling_price:  data.selling_price,
          notes:          data.notes,
        });
      }
      return apiPost<InventoryItem>(`/inventory/${inventoryItem!.id}/stock-in`, {
        sku:            data.sku,
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
          : "New stock record has been created.",
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Stock In Failed", err?.message ?? "Something went wrong.");
    },
  });

  function handleFormSubmit(data: StockInFormValues) {
    if (showBranchField && !data.branch_id) {
      setError("branch_id", { message: "Branch is required" });
      return;
    }
    if (isFreeMode && !data.product_id) {
      setError("product_id", { message: "Product is required" });
      return;
    }
    mutation.mutate(data);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock In"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leftIcon={<PackagePlus className="w-4 h-4" />}
            onClick={handleSubmit(handleFormSubmit)}
            isLoading={mutation.isPending}
          >
            Add Stock
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Branch — org-level users in free mode */}
        {showBranchField && (
          <Controller
            name="branch_id"
            control={control}
            render={({ field }) => (
              <Autocomplete
                label="Branch"
                required
                options={branchOptions}
                value={field.value ?? ""}
                onChange={field.onChange}
                placeholder="Select branch…"
                error={errors.branch_id?.message}
              />
            )}
          />
        )}

        {/* Product — label in row mode, searchable autocomplete with create-new in free mode */}
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
                onChange={(val) => {
                  field.onChange(val);
                  setValue("sku", "");
                }}
                onCreateNew={() => window.open("/products", "_blank", "noopener,noreferrer")}
                placeholder="Search product…"
                error={errors.product_id?.message}
              />
            )}
          />
        )}

        {/* SKU + Quantity */}
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="sku"
            control={control}
            render={({ field }) => (
              <Autocomplete
                label="SKU"
                required
                options={skuOptions}
                value={field.value ?? ""}
                onChange={field.onChange}
                placeholder={productIdForSku ? "Select SKU…" : "Select a product first…"}
                disabled={!productIdForSku}
                error={errors.sku?.message}
              />
            )}
          />
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
        </div>

        {/* Selling Price | Profit Margin | Purchase Price */}
        <div className="grid grid-cols-3 gap-3">
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
                onChange={(e) => handleSellingPriceChange(parseFloat(e.target.value) || 0)}
              />
            )}
          />
          <Controller
            name="profit_margin"
            control={control}
            render={({ field }) => (
              <Input
                label="Margin (%)"
                type="number"
                placeholder="e.g. 20"
                error={errors.profit_margin?.message}
                value={field.value == null ? "" : field.value}
                onChange={(e) => handleProfitMarginChange(e.target.value)}
              />
            )}
          />
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
                onChange={(e) => handlePurchasePriceChange(parseFloat(e.target.value) || 0)}
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
