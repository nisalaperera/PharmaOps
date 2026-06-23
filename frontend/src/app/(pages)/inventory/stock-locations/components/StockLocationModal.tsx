"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useBranch } from "@/hooks/useBranch";
import { stockLocationSchema, type StockLocationFormValues } from "../schemas";
import type { StockLocation } from "@/types";

interface StockLocationModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingLocation: StockLocation | null;
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

export function StockLocationModal({ isOpen, onClose, editingLocation }: StockLocationModalProps) {
  const queryClient     = useQueryClient();
  const { activeBranchId } = useBranch();
  const isEditing       = editingLocation !== null;

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } =
    useForm<StockLocationFormValues>({
      resolver:      zodResolver(stockLocationSchema),
      defaultValues: { name: "", code: "", description: "", is_active: true },
    });

  const watchedIsActive = useWatch({ control, name: "is_active" });

  useEffect(() => {
    if (isOpen) {
      reset(
        isEditing
          ? {
              name:        editingLocation.name,
              code:        editingLocation.code,
              description: editingLocation.description ?? "",
              is_active:   editingLocation.is_active,
            }
          : { name: "", code: "", description: "", is_active: true }
      );
    }
  }, [isOpen, isEditing, editingLocation, reset]);

  const mutation = useMutation({
    mutationFn: (data: StockLocationFormValues) =>
      isEditing
        ? apiPatch<StockLocation>(`/stock-locations/${editingLocation!.id}`, data)
        : apiPost<StockLocation>("/stock-locations", { ...data, branch_id: activeBranchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
      showToast(
        "success",
        isEditing ? "Location Updated" : "Location Created",
        isEditing
          ? `${editingLocation!.name} has been updated.`
          : "New stock location has been created."
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Stock Location" : "New Stock Location"}
      size="md"
      headerExtra={
        <ActiveToggle
          value={watchedIsActive}
          onChange={(v) => setValue("is_active", v, { shouldDirty: true })}
        />
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit((d) => mutation.mutate(d))} isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create Location"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name" placeholder="e.g. Shelf A" required
            {...register("name")} error={errors.name?.message} />
          <Input label="Code" placeholder="e.g. SH-A" required maxLength={20}
            {...register("code")} error={errors.code?.message} />
        </div>
        <Input label="Description" placeholder="Optional description"
          {...register("description")} />
      </div>
    </Modal>
  );
}
