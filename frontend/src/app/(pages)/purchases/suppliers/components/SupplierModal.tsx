"use client";

import { useEffect }        from "react";
import { useForm }          from "react-hook-form";
import { zodResolver }      from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }            from "@/components/ui/Modal";
import { Button }           from "@/components/ui/Button";
import { Input }            from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { showToast }         from "@/lib/toast";
import { SUPPLIER_TYPE_OPTIONS } from "@/lib/constants";
import { supplierSchema, type SupplierFormValues } from "../schemas";
import type { Supplier, SupplierType } from "@/types";

interface SupplierModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingSupplier: Supplier | null;
}

export function SupplierModal({ isOpen, onClose, editingSupplier }: SupplierModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingSupplier !== null;

  const form = useForm<SupplierFormValues>({
    resolver:      zodResolver(supplierSchema),
    defaultValues: { supplier_type: "DISTRIBUTOR", short_name: "", legal_name: "", registration_number: "" },
  });

  const watchedType = form.watch("supplier_type");

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      form.reset({
        supplier_type:       editingSupplier.supplier_type,
        short_name:          editingSupplier.short_name,
        legal_name:          editingSupplier.legal_name,
        registration_number: editingSupplier.registration_number ?? "",
      });
    } else {
      form.reset({ supplier_type: "DISTRIBUTOR", short_name: "", legal_name: "", registration_number: "" });
    }
  }, [isOpen, editingSupplier]);

  const mutation = useMutation({
    mutationFn: (values: SupplierFormValues) =>
      isEditing
        ? apiPatch<Supplier>(`/suppliers/${editingSupplier!.id}`, values)
        : apiPost<Supplier>("/suppliers", values),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast(
        "success",
        isEditing ? "Supplier Updated" : "Supplier Created",
        isEditing
          ? `${result.short_name} has been updated.`
          : `${result.short_name} has been created. Add channels from the supplier list.`,
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Supplier" : "New Supplier"}
      size="md"
    >
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">

        {/* ── Supplier Type ─────────────────────────────────────────────── */}
        <div>
          <label className="form-label">Supplier Type</label>
          <div className="flex gap-2 mt-1">
            {SUPPLIER_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => !isEditing && form.setValue("supplier_type", opt.value as SupplierType)}
                disabled={isEditing}
                className={[
                  "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                  watchedType === opt.value
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
                  isEditing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {isEditing && (
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Supplier type cannot be changed after creation.
            </p>
          )}
        </div>

        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <Input
          label="Short Name"
          placeholder="e.g. MedPharm"
          {...form.register("short_name")}
          error={form.formState.errors.short_name?.message}
        />
        <Input
          label="Legal Name"
          placeholder="e.g. MedPharm Distributors (Pvt) Ltd"
          {...form.register("legal_name")}
          error={form.formState.errors.legal_name?.message}
        />
        <Input
          label="Registration Number"
          placeholder="Optional"
          {...form.register("registration_number")}
          error={form.formState.errors.registration_number?.message}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create Supplier"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
