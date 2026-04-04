"use client";

import { useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { formatPhoneNumber, cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import { branchSchema, type BranchFormValues } from "@/app/(pages)/branches/schemas";
import type { Branch } from "@/types";

interface BranchModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  editingBranch: Branch | null;
}

// ─── Small active toggle for modal header ─────────────────────────────────────

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

export function BranchModal({ isOpen, onClose, editingBranch }: BranchModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingBranch !== null;

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<BranchFormValues>({
    resolver:      zodResolver(branchSchema),
    defaultValues: { name: "", address: "", phone: "", license_number: "", is_active: true },
  });

  const watchedIsActive = useWatch({ control, name: "is_active" });

  useEffect(() => {
    if (isOpen) {
      reset(
        isEditing
          ? {
              name:           editingBranch.name,
              address:        editingBranch.address,
              phone:          editingBranch.phone,
              license_number: editingBranch.license_number,
              is_active:      editingBranch.is_active,
            }
          : { name: "", address: "", phone: "", license_number: "", is_active: true }
      );
    }
  }, [isOpen, isEditing, editingBranch, reset]);

  const mutation = useMutation({
    mutationFn: (data: BranchFormValues) =>
      isEditing
        ? apiPatch<Branch>(`/branches/${editingBranch!.id}`, data)
        : apiPost<Branch>("/branches", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      showToast(
        "success",
        isEditing ? "Branch Updated" : "Branch Created",
        isEditing
          ? `${editingBranch!.name} has been updated successfully.`
          : "New branch has been added to the system."
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  // Active toggle in the modal header (both create and edit)
  const headerExtra = (
    <ActiveToggle
      value={watchedIsActive}
      onChange={(v) => setValue("is_active", v, { shouldDirty: true })}
    />
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Branch" : "New Branch"}
      size="lg"
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
            {isEditing ? "Save Changes" : "Create Branch"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Branch Name"
          placeholder="e.g. Colombo Main Branch"
          required
          error={errors.name?.message}
          {...register("name")}
        />

        <Input
          label="Address"
          placeholder="Full address of the branch"
          required
          error={errors.address?.message}
          {...register("address")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <Input
                label="Phone"
                placeholder="077 123 4567"
                required
                error={errors.phone?.message}
                value={field.value}
                onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                onBlur={field.onBlur}
                maxLength={12}
              />
            )}
          />

          <Input
            label="License Number"
            placeholder="e.g. PHARM-2024-001"
            required
            error={errors.license_number?.message}
            {...register("license_number")}
          />
        </div>
      </div>
    </Modal>
  );
}
