"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { formatPhoneNumber } from "@/lib/utils";
import { branchSchema, type BranchFormValues } from "./schemas";
import type { Branch } from "@/types";
import toast from "react-hot-toast";

interface BranchModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  editingBranch: Branch | null;
}

export function BranchModal({ isOpen, onClose, editingBranch }: BranchModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingBranch !== null;

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<BranchFormValues>({
    resolver:      zodResolver(branchSchema),
    defaultValues: { name: "", address: "", phone: "", license_number: "", is_active: true },
  });

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
      toast.success(isEditing ? "Branch updated successfully" : "Branch created successfully");
      onClose();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Something went wrong");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Branch" : "New Branch"}
      size="lg"
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

        <div className="flex items-center gap-3 pt-1">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" {...register("is_active")} />
            <div
              className="w-10 h-6 rounded-full peer transition-all
                         bg-[var(--color-border)]
                         peer-checked:bg-primary-500
                         after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                         after:bg-white after:rounded-full after:h-5 after:w-5
                         after:transition-all peer-checked:after:translate-x-4"
            />
          </label>
          <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Active branch
          </span>
        </div>
      </div>
    </Modal>
  );
}
