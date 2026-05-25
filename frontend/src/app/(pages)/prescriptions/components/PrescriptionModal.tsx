"use client";

import { useEffect } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { apiPost, apiGet } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/hooks/useAuth";
import { prescriptionCreateSchema, type PrescriptionCreateValues } from "@/app/(pages)/prescriptions/schemas";
import type { Branch, Doctor, Patient, Product, PaginatedResponse, Prescription } from "@/types";

interface PrescriptionModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function PrescriptionModal({ isOpen, onClose }: PrescriptionModalProps) {
  const queryClient               = useQueryClient();
  const { user: me, permissions } = useAuth();

  const form = useForm<PrescriptionCreateValues>({
    resolver:      zodResolver(prescriptionCreateSchema),
    defaultValues: {
      patient_id:        "",
      doctor_id:         "",
      branch_id:         "",
      prescription_date: "",
      expiry_date:       "",
      items: [{ product_id: "", product_name: "", dosage: "", frequency: "", duration: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name:    "items",
    keyName: "rhfKey",
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      patient_id:        "",
      doctor_id:         "",
      branch_id:         permissions?.isOrgLevel ? "" : (me?.branchId ?? ""),
      prescription_date: "",
      expiry_date:       "",
      items: [{ product_id: "", product_name: "", dosage: "", frequency: "", duration: "", quantity: 1 }],
    });
  }, [isOpen]);

  const { data: patientsData } = useQuery({
    queryKey: ["patients-select"],
    queryFn:  () => apiGet<PaginatedResponse<Patient>>("/patients", { page_size: 200, sort_by: "name", sort_dir: "asc" }),
    enabled:  isOpen,
    staleTime: 60_000,
  });

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors-active"],
    queryFn:  () => apiGet<PaginatedResponse<Doctor>>("/doctors", { is_active: true, page_size: 200 }),
    enabled:  isOpen,
    staleTime: 60_000,
  });

  const { data: productsData } = useQuery({
    queryKey: ["products-select"],
    queryFn:  () => apiGet<PaginatedResponse<Product>>("/products", { page_size: 200, is_active: true }),
    enabled:  isOpen,
    staleTime: 60_000,
  });

  const { data: branchesData } = useQuery({
    queryKey: ["branches-active"],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: true, page_size: 100 }),
    enabled:  isOpen && (permissions?.isOrgLevel ?? false),
    staleTime: 60_000,
  });

  const patients = patientsData?.data ?? [];
  const doctors  = doctorsData?.data ?? [];
  const products = productsData?.data ?? [];
  const branches = branchesData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (values: PrescriptionCreateValues) =>
      apiPost<Prescription>("/prescriptions", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      showToast("success", "Prescription Created", "Prescription has been recorded successfully.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const errors = form.formState.errors;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Prescription" size="xl">
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">

        {/* ── Patient + Doctor ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Patient <span className="text-danger-500">*</span>
            </label>
            <select {...form.register("patient_id")} className="form-select w-full">
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.relationship}) — {p.customer_name}</option>
              ))}
            </select>
            {errors.patient_id && (
              <p className="text-xs text-danger-500">{errors.patient_id.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Doctor <span className="text-danger-500">*</span>
            </label>
            <select {...form.register("doctor_id")} className="form-select w-full">
              <option value="">Select doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>
              ))}
            </select>
            {errors.doctor_id && (
              <p className="text-xs text-danger-500">{errors.doctor_id.message}</p>
            )}
          </div>
        </div>

        {/* ── Branch (org-level only) + Dates ──────────────────────────────── */}
        <div className={permissions?.isOrgLevel ? "grid grid-cols-3 gap-4" : "grid grid-cols-2 gap-4"}>
          {permissions?.isOrgLevel && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                Branch <span className="text-danger-500">*</span>
              </label>
              <select {...form.register("branch_id")} className="form-select w-full">
                <option value="">Select branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {errors.branch_id && (
                <p className="text-xs text-danger-500">{errors.branch_id.message}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Prescription Date <span className="text-danger-500">*</span>
            </label>
            <Input
              type="date"
              {...form.register("prescription_date")}
              error={errors.prescription_date?.message}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              Expiry Date <span className="text-danger-500">*</span>
            </label>
            <Input
              type="date"
              {...form.register("expiry_date")}
              error={errors.expiry_date?.message}
            />
          </div>
        </div>

        {/* ── Items ─────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Prescription Items
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() =>
                append({ product_id: "", product_name: "", dosage: "", frequency: "", duration: "", quantity: 1 })
              }
            >
              Add Item
            </Button>
          </div>

          {errors.items?.root && (
            <p className="text-xs text-danger-500">{errors.items.root.message}</p>
          )}

          <div className="space-y-2">
            {fields.map((field, index) => (
              <div
                key={field.rhfKey}
                className="rounded-xl border p-3 space-y-3"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary-500">Item {index + 1}</span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Product select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                    Product <span className="text-danger-500">*</span>
                  </label>
                  <Controller
                    name={`items.${index}.product_id`}
                    control={form.control}
                    render={({ field: productField }) => (
                      <select
                        {...productField}
                        className="form-select w-full"
                        onChange={(e) => {
                          productField.onChange(e);
                          const selected = products.find((p) => p.id === e.target.value);
                          form.setValue(`items.${index}.product_name`, selected?.name ?? "", { shouldValidate: true });
                        }}
                      >
                        <option value="">Select product…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.sku ? ` (${p.sku})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                  {errors.items?.[index]?.product_id && (
                    <p className="text-xs text-danger-500">{errors.items[index]?.product_id?.message}</p>
                  )}
                </div>

                {/* Dosage / Frequency / Duration / Qty */}
                <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 90px" }}>
                  <Input
                    {...form.register(`items.${index}.dosage`)}
                    label="Dosage"
                    placeholder="e.g. 500mg"
                    error={errors.items?.[index]?.dosage?.message}
                  />
                  <Input
                    {...form.register(`items.${index}.frequency`)}
                    label="Frequency"
                    placeholder="e.g. 3x daily"
                    error={errors.items?.[index]?.frequency?.message}
                  />
                  <Input
                    {...form.register(`items.${index}.duration`)}
                    label="Duration"
                    placeholder="e.g. 7 days"
                    error={errors.items?.[index]?.duration?.message}
                  />
                  <Input
                    {...form.register(`items.${index}.quantity`)}
                    type="number"
                    label="Qty"
                    min={1}
                    error={errors.items?.[index]?.quantity?.message}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            Create Prescription
          </Button>
        </div>

      </form>
    </Modal>
  );
}
