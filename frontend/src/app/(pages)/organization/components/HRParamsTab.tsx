"use client";

import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { chainHRParamsSchema, type ChainHRParamsFormValues } from "../schemas";
import type { Chain, ChainHRParams } from "@/types";

interface HRParamsTabProps {
  chain: Chain;
}

function hrToForm(hr: ChainHRParams): ChainHRParamsFormValues {
  return {
    standard_daily_hours:   hr.standard_daily_hours,
    working_days_per_month: hr.working_days_per_month,
    ot_rate_multiplier:     hr.ot_rate_multiplier,
    epf_employee_rate:      hr.epf_employee_rate,
    epf_employer_rate:      hr.epf_employer_rate,
    etf_employer_rate:      hr.etf_employer_rate,
    paye_tax_slabs:         hr.paye_tax_slabs ?? [],
  };
}

export function HRParamsTab({ chain }: HRParamsTabProps) {
  const queryClient = useQueryClient();

  const form = useForm<ChainHRParamsFormValues>({
    resolver:      zodResolver(chainHRParamsSchema),
    defaultValues: hrToForm(chain.hr_params),
  });

  const { fields: slabFields, append: appendSlab, remove: removeSlab } = useFieldArray({
    control: form.control,
    name:    "paye_tax_slabs",
  });

  useEffect(() => {
    form.reset(hrToForm(chain.hr_params));
  }, [chain, form]);

  const mutation = useMutation({
    mutationFn: (values: ChainHRParamsFormValues) =>
      apiPatch<Chain>("/chain", { hr_params: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chain"] });
      showToast("success", "HR Params Saved", "Organization HR parameters have been updated.");
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Save Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Input label="Standard Daily Hours" type="number" step="0.5"
          {...form.register("standard_daily_hours")} error={errors.standard_daily_hours?.message} />
        <Input label="Working Days / Month" type="number"
          {...form.register("working_days_per_month")} error={errors.working_days_per_month?.message} />
        <Input label="OT Rate Multiplier" type="number" step="0.1"
          {...form.register("ot_rate_multiplier")} error={errors.ot_rate_multiplier?.message} />
        <Input label="EPF Employee Rate (%)" type="number" step="0.1"
          {...form.register("epf_employee_rate")} error={errors.epf_employee_rate?.message} />
        <Input label="EPF Employer Rate (%)" type="number" step="0.1"
          {...form.register("epf_employer_rate")} error={errors.epf_employer_rate?.message} />
        <Input label="ETF Employer Rate (%)" type="number" step="0.1"
          {...form.register("etf_employer_rate")} error={errors.etf_employer_rate?.message} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            PAYE Tax Slabs
          </span>
          <Button type="button" variant="outline" size="sm"
            leftIcon={<Plus className="w-3 h-3" />}
            onClick={() => appendSlab({ min_amount: 0, max_amount: null, rate_percent: 0, fixed_amount: 0 })}>
            Add Slab
          </Button>
        </div>

        {slabFields.length === 0 && (
          <p className="text-xs py-2 text-center" style={{ color: "var(--color-text-muted)" }}>
            No tax slabs configured.
          </p>
        )}

        {slabFields.length > 0 && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--color-surface-2)" }}>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Min Amount</th>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Max Amount</th>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Rate (%)</th>
                  <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Fixed Amount</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {slabFields.map((slab, idx) => (
                  <tr key={slab.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.01" {...form.register(`paye_tax_slabs.${idx}.min_amount`)} className="form-input text-xs w-full" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.01" placeholder="No limit" {...form.register(`paye_tax_slabs.${idx}.max_amount`)} className="form-input text-xs w-full" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.1" {...form.register(`paye_tax_slabs.${idx}.rate_percent`)} className="form-input text-xs w-full" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.01" {...form.register(`paye_tax_slabs.${idx}.fixed_amount`)} className="form-input text-xs w-full" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" onClick={() => removeSlab(idx)}
                        className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" variant="primary" isLoading={mutation.isPending}>
          Save HR Params
        </Button>
      </div>
    </form>
  );
}
