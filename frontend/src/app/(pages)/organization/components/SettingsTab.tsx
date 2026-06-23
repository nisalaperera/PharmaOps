"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { CURRENCY_OPTIONS } from "@/lib/constants";
import { chainSettingsSchema, type ChainSettingsFormValues } from "../schemas";
import type { Chain, ChainSettings } from "@/types";

interface SettingsTabProps {
  chain: Chain;
}

function settingsToForm(settings: ChainSettings): ChainSettingsFormValues {
  return {
    default_currency:       settings.default_currency,
    low_stock_threshold:    settings.low_stock_threshold,
    expiry_alert_days:      settings.expiry_alert_days,
    loyalty_points_rate:    settings.loyalty_points_rate ?? undefined,
    tax_enabled:            settings.tax_enabled,
    is_discount_applicable: settings.is_discount_applicable ?? false,
    invoice_footer_text:    settings.invoice_footer_text ?? "",
    storage_conditions:     settings.storage_conditions ?? [],
    special_instructions:   settings.special_instructions ?? [],
    dosage_instructions:    settings.dosage_instructions ?? [],
  };
}

export function SettingsTab({ chain }: SettingsTabProps) {
  const queryClient = useQueryClient();

  const form = useForm<ChainSettingsFormValues>({
    resolver:      zodResolver(chainSettingsSchema),
    defaultValues: settingsToForm(chain.settings),
  });

  useEffect(() => {
    form.reset(settingsToForm(chain.settings));
  }, [chain, form]);

  const mutation = useMutation({
    mutationFn: (values: ChainSettingsFormValues) =>
      apiPatch<Chain>("/chain", { settings: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chain"] });
      showToast("success", "Settings Saved", "Organization settings have been updated.");
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Save Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="form-label">Default Currency</label>
          <select {...form.register("default_currency")} className="form-select w-full">
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <Input label="Low Stock Threshold" type="number"
          {...form.register("low_stock_threshold")} error={errors.low_stock_threshold?.message} />

        <Input label="Expiry Alert Days" type="number"
          {...form.register("expiry_alert_days")} error={errors.expiry_alert_days?.message} />

        <Input label="Loyalty Points Rate" type="number" step="0.01" placeholder="e.g. 0.01"
          {...form.register("loyalty_points_rate")} error={errors.loyalty_points_rate?.message} />

        <div className="flex items-center gap-3 pt-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...form.register("tax_enabled")}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
            <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Tax Enabled</span>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...form.register("is_discount_applicable")}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
            <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Discount Applicable</span>
          </label>
        </div>
      </div>

      <Input label="Invoice Footer Text" placeholder="Text shown at the bottom of invoices"
        {...form.register("invoice_footer_text")} />

      <TagListField label="Storage Conditions"
        values={form.watch("storage_conditions") ?? []}
        onChange={(vals) => form.setValue("storage_conditions", vals, { shouldDirty: true })}
        placeholder="Type and press Enter" />

      <TagListField label="Special Instructions"
        values={form.watch("special_instructions") ?? []}
        onChange={(vals) => form.setValue("special_instructions", vals, { shouldDirty: true })}
        placeholder="Type and press Enter" />

      <TagListField label="Dosage Instructions"
        values={form.watch("dosage_instructions") ?? []}
        onChange={(vals) => form.setValue("dosage_instructions", vals, { shouldDirty: true })}
        placeholder="Type and press Enter" />

      <div className="flex justify-end pt-2">
        <Button type="submit" variant="primary" isLoading={mutation.isPending}>
          Save Settings
        </Button>
      </div>
    </form>
  );
}

interface TagListFieldProps {
  label:       string;
  values:      string[];
  onChange:    (values: string[]) => void;
  placeholder?: string;
}

function TagListField({ label, values, onChange, placeholder }: TagListFieldProps) {
  const [inputValue, setInputValue] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && !values.includes(trimmed)) {
        onChange([...values, trimmed]);
      }
      setInputValue("");
    }
  }

  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border min-h-[2.5rem]"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        {values.map((tag, i) => (
          <span key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
            {tag}
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="hover:text-danger-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input type="text" value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] text-xs bg-transparent outline-none"
          style={{ color: "var(--color-text)" }} />
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
        Type a value and press Enter to add
      </p>
    </div>
  );
}
