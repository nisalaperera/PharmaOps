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
    defaultValues: { supplier_type: "DISTRIBUTOR", name: "", legal_name: "", registration_number: "", credit_term_days: 30, credit_limit: undefined, notes: "" },
  });

  const watchedType = form.watch("supplier_type");

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      form.reset({
        supplier_type:       editingSupplier.supplier_type,
        name:                editingSupplier.name,
        legal_name:          editingSupplier.legal_name,
        registration_number: editingSupplier.registration_number ?? "",
        credit_term_days:    editingSupplier.credit_term_days ?? 30,
        credit_limit:        editingSupplier.credit_limit ?? undefined,
        notes:               editingSupplier.notes ?? "",
      });
    } else {
      form.reset({ supplier_type: "DISTRIBUTOR", name: "", legal_name: "", registration_number: "", credit_term_days: 30, credit_limit: undefined, notes: "" });
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
          ? `${result.name} has been updated.`
          : `${result.name} has been created. Add channels from the supplier list.`,
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
          label="Name"
          placeholder="e.g. MedPharm"
          required
          {...form.register("name")}
          error={form.formState.errors.name?.message}
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

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Credit Term Days"
            type="number"
            placeholder="30"
            {...form.register("credit_term_days")}
            error={form.formState.errors.credit_term_days?.message}
          />
          <Input
            label="Credit Limit"
            type="number"
            step="0.01"
            placeholder="Optional"
            {...form.register("credit_limit")}
            error={form.formState.errors.credit_limit?.message}
          />
        </div>

        <div>
          <label className="form-label">Notes</label>
          <textarea
            placeholder="Optional notes about this supplier"
            rows={2}
            className="form-input resize-none"
            {...form.register("notes")}
          />
        </div>

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
