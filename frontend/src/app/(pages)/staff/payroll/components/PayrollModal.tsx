"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { apiGet, apiPost } from "@/lib/api-client";
import { getStaffDisplayName, cn } from "@/lib/utils";
import { MONTH_OPTIONS, DEDUCTION_TYPE_OPTIONS } from "@/lib/constants";
import { showToast } from "@/lib/toast";
import { payrollCreateSchema, type PayrollCreateValues } from "@/app/(pages)/staff/payroll/schemas";
import { useAuth } from "@/hooks/useAuth";
import type { Staff, Branch, Payroll, PaginatedResponse } from "@/types";

interface PayrollModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function PayrollModal({ isOpen, onClose }: PayrollModalProps) {
  const queryClient = useQueryClient();
  const { user: me, permissions } = useAuth();

  const today       = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const branchId    = me?.branchId ?? "";

  // â”€â”€ Branch + staff cascade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled:   permissions?.isOrgLevel ?? false,
  });
  const branches = branchesData?.data ?? [];

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const staffQueryBranch = permissions?.isOrgLevel ? selectedBranchId : branchId;

  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey:  ["staff-by-branch", staffQueryBranch],
    queryFn:   () => apiGet<Staff[]>(`/staff/by-branch/${staffQueryBranch}`),
    staleTime: 2 * 60 * 1000,
    enabled:   !!staffQueryBranch,
  });

  // â”€â”€ Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const form = useForm<PayrollCreateValues>({
    resolver:      zodResolver(payrollCreateSchema),
    defaultValues: {
      staff_id:   "",
      branch_id:  branchId,
      month:      currentMonth,
      year:       currentYear,
      deductions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name:    "deductions",
    keyName: "rhfKey",
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelectedBranchId("");
    form.reset({
      staff_id:   "",
      branch_id:  branchId,
      month:      currentMonth,
      year:       currentYear,
      deductions: [],
    });
  }, [isOpen]);

  // â”€â”€ Mutation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const mutation = useMutation({
    mutationFn: (values: PayrollCreateValues) => apiPost<Payroll>("/staff/payroll", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      showToast("success", "Payroll Generated", "The payroll record has been created successfully.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Generate Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Generate Payroll"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => form.handleSubmit((v) => mutation.mutate(v))()}
            isLoading={mutation.isPending}
          >
            Generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Branch â€” org-level only */}
        {permissions?.isOrgLevel && (
          <div>
            <label className="form-label">
              Branch <span className="text-danger-500">*</span>
            </label>
            <Controller
              name="branch_id"
              control={form.control}
              render={({ field }) => (
                <select
                  className={cn("form-select", form.formState.errors.branch_id && "border-danger-500")}
                  value={field.value}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    setSelectedBranchId(e.target.value);
                    form.setValue("staff_id", "");
                  }}
                >
                  <option value="">Select branchâ€¦</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            />
            {form.formState.errors.branch_id && (
              <p className="form-error">{form.formState.errors.branch_id.message}</p>
            )}
          </div>
        )}

        {/* Staff Member */}
        <div>
          <label className="form-label">
            Staff Member <span className="text-danger-500">*</span>
          </label>
          <select
            className={cn(
              "form-select",
              form.formState.errors.staff_id && "border-danger-500",
              !staffQueryBranch && "opacity-50 cursor-not-allowed"
            )}
            disabled={!staffQueryBranch}
            {...form.register("staff_id")}
          >
            <option value="">
              {permissions?.isOrgLevel && !staffQueryBranch
                ? "Select a branch firstâ€¦"
                : "Select staff memberâ€¦"}
            </option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>{getStaffDisplayName(s)}</option>
            ))}
          </select>
          {form.formState.errors.staff_id && (
            <p className="form-error">{form.formState.errors.staff_id.message}</p>
          )}
        </div>

        {/* Month + Year */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">
              Month <span className="text-danger-500">*</span>
            </label>
            <select className="form-select" {...form.register("month", { valueAsNumber: true })}>
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Year"
            type="number"
            min={2020}
            max={2035}
            required
            error={form.formState.errors.year?.message}
            {...form.register("year", { valueAsNumber: true })}
          />
        </div>

        {/* Deductions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="form-label mb-0">Deductions</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => append({ type: "TAX", description: "", amount: 0 })}
            >
              Add
            </Button>
          </div>

          {fields.length === 0 ? (
            <p
              className="text-xs py-3 text-center rounded-lg border border-dashed"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              No deductions â€” gross salary will equal net salary
            </p>
          ) : (
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div
                  key={field.rhfKey}
                  className="grid items-start gap-2 p-3 rounded-lg border"
                  style={{
                    gridTemplateColumns: "130px 1fr 110px 36px",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <select
                    className="form-select text-sm"
                    {...form.register(`deductions.${index}.type`)}
                  >
                    {DEDUCTION_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  <Input
                    placeholder="Description (optional)"
                    {...form.register(`deductions.${index}.description`)}
                  />

                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    {...form.register(`deductions.${index}.amount`, { valueAsNumber: true })}
                    error={form.formState.errors.deductions?.[index]?.amount?.message}
                  />

                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-2 rounded-md transition-colors flex-shrink-0 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
