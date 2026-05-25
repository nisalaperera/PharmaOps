"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }     from "@/components/ui/Modal";
import { Button }    from "@/components/ui/Button";
import { Input }     from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { cn }        from "@/lib/utils";
import { SKU_TYPE_OPTIONS } from "@/lib/constants";
import { skuSchema, type SkuFormValues } from "../schemas";
import type { ProductSku } from "@/types";

interface SkuModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  editingSku: ProductSku | null;
  onCreated?: (id: string) => void;
}

function ActiveToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors select-none",
        value
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", value ? "bg-emerald-500" : "bg-slate-400")} />
      {value ? "Active" : "Inactive"}
    </button>
  );
}

export function SkuModal({ isOpen, onClose, editingSku, onCreated }: SkuModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingSku !== null;

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } =
    useForm<SkuFormValues>({
      resolver:      zodResolver(skuSchema),
      defaultValues: { name: "", plural: "", sku_type: "COUNT", is_active: true },
    });

  const watchedIsActive = useWatch({ control, name: "is_active" });

  useEffect(() => {
    if (isOpen) {
      reset(
        isEditing
          ? {
              name:      editingSku.name,
              plural:    editingSku.plural ?? "",
              sku_type:  editingSku.sku_type,
              is_active: editingSku.is_active,
            }
          : { name: "", plural: "", sku_type: "COUNT", is_active: true }
      );
    }
  }, [isOpen, isEditing, editingSku, reset]);

  const mutation = useMutation({
    mutationFn: (data: SkuFormValues) =>
      isEditing
        ? apiPatch<ProductSku>(`/products/skus/${editingSku!.id}`, data)
        : apiPost<ProductSku>("/products/skus", data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["skus"] });
      showToast(
        "success",
        isEditing ? "SKU Updated" : "SKU Created",
        isEditing
          ? `${editingSku!.name} has been updated.`
          : "New SKU has been added."
      );
      if (!isEditing && onCreated) onCreated(created.id);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  const headerExtra = (
    <ActiveToggle
      value={watchedIsActive ?? true}
      onChange={(v) => setValue("is_active", v, { shouldDirty: true })}
    />
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit SKU" : "New SKU"}
      size="md"
      headerExtra={headerExtra}
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
            {isEditing ? "Save Changes" : "Create SKU"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="SKU Name"
            placeholder="e.g. Tablet"
            required
            error={errors.name?.message}
            {...register("name")}
          />
          <Input
            label="Plural"
            placeholder="e.g. Tablets"
            error={errors.plural?.message}
            {...register("plural")}
          />
        </div>

        <div>
          <label className="form-label">
            SKU Type <span className="text-danger-500">*</span>
          </label>
          <select className="form-select" {...register("sku_type")}>
            {SKU_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {errors.sku_type && (
            <p className="form-error">{errors.sku_type.message}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
