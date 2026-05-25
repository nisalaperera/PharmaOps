"use client";

import { useEffect } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageMinus } from "lucide-react";
import { Modal }    from "@/components/ui/Modal";
import { Button }   from "@/components/ui/Button";
import { Input }    from "@/components/ui/Input";
import { apiPost }  from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { STOCK_OUT_REASON_OPTIONS } from "@/lib/constants";
import type { InventoryItem } from "@/types";

const stockOutSchema = z.object({
  batch_number: z.string().min(1, "Select a batch"),
  quantity:     z.number({ invalid_type_error: "Quantity is required" }).int().min(1, "Must be at least 1"),
  reason:       z.enum(["DAMAGED", "EXPIRED", "OTHER"], { errorMap: () => ({ message: "Select a reason" }) }),
  notes:        z.string().optional().nullable(),
});

type StockOutFormValues = z.infer<typeof stockOutSchema>;

interface StockOutModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  inventoryItem: InventoryItem | null;
}

export function StockOutModal({ isOpen, onClose, inventoryItem }: StockOutModalProps) {
  const queryClient = useQueryClient();

  const availableBatches = (inventoryItem?.batches ?? []).filter((b) => b.quantity > 0);

  const { register, handleSubmit, reset, control, formState: { errors } } =
    useForm<StockOutFormValues>({
      resolver:      zodResolver(stockOutSchema),
      defaultValues: { batch_number: "", quantity: 1, reason: "DAMAGED", notes: "" },
    });

  useEffect(() => {
    if (isOpen) {
      reset({
        batch_number: availableBatches[0]?.batch_number ?? "",
        quantity: 1,
        reason: "DAMAGED",
        notes: "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reset]);

  const watchedBatchNumber = useWatch({ control, name: "batch_number" });
  const selectedBatch      = availableBatches.find((b) => b.batch_number === watchedBatchNumber);

  const mutation = useMutation({
    mutationFn: (data: StockOutFormValues) =>
      apiPost<InventoryItem>(`/inventory/${inventoryItem!.id}/stock-out`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast(
        "success",
        "Stock Removed",
        `Stock has been removed from ${inventoryItem?.product_name}.`,
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Stock Out Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Out"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            leftIcon={<PackageMinus className="w-4 h-4" />}
            onClick={handleSubmit((data) => mutation.mutate(data))}
            isLoading={mutation.isPending}
          >
            Remove Stock
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Product name */}
        <div
          className="px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
        >
          {inventoryItem?.product_name}
        </div>

        {/* Batch select */}
        <div>
          <label className="form-label">
            Batch <span className="text-danger-500">*</span>
          </label>
          {availableBatches.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No batches with available stock.
            </p>
          ) : (
            <select className="form-select" {...register("batch_number")}>
              {availableBatches.map((b) => (
                <option key={b.batch_number} value={b.batch_number}>
                  {b.batch_number} ({b.quantity} units · exp {b.expiry_date})
                </option>
              ))}
            </select>
          )}
          {errors.batch_number && (
            <p className="form-error">{errors.batch_number.message}</p>
          )}
          {selectedBatch && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
              Available: <span className="font-semibold">{selectedBatch.quantity}</span> units
            </p>
          )}
        </div>

        {/* Quantity */}
        <Controller
          name="quantity"
          control={control}
          render={({ field }) => (
            <Input
              label="Quantity to Remove"
              type="number"
              placeholder="e.g. 10"
              required
              error={errors.quantity?.message}
              value={field.value || ""}
              onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
            />
          )}
        />

        {/* Reason */}
        <div>
          <label className="form-label">
            Reason <span className="text-danger-500">*</span>
          </label>
          <select className="form-select" {...register("reason")}>
            {STOCK_OUT_REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {errors.reason && (
            <p className="form-error">{errors.reason.message}</p>
          )}
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
