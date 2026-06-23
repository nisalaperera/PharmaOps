"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Modal }        from "@/components/ui/Modal";
import { Button }       from "@/components/ui/Button";
import { Input }        from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { useBranch } from "@/hooks/useBranch";
import { DOSAGE_FORM_OPTIONS, CONTROLLED_SCHEDULE_OPTIONS } from "@/lib/constants";
import { genericSchema, type GenericFormValues } from "../schemas";
import type { ProductGeneric, StockLocation } from "@/types";

interface GenericModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingGeneric:  ProductGeneric | null;
}

const DEFAULT_VALUES: GenericFormValues = {
  name: "", description: "", dosage_form: null,
  requires_prescription: false, controlled_substance_schedule: "NONE",
  active_ingredients: [], side_effects: [], drug_interactions: [],
  local_license_number: "", storage_conditions: [], special_instructions: [],
  dosage_instructions: [], stock_location_id: null,
};

export function GenericModal({ isOpen, onClose, editingGeneric }: GenericModalProps) {
  const queryClient        = useQueryClient();
  const { activeBranchId } = useBranch();
  const isEditing          = editingGeneric !== null;

  const form = useForm<GenericFormValues>({
    resolver:      zodResolver(genericSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { data: stockLocations = [] } = useQuery<StockLocation[]>({
    queryKey: ["stock-locations", activeBranchId],
    queryFn:  () => apiGet<StockLocation[]>("/stock-locations", {
      ...(activeBranchId && { branch_id: activeBranchId }),
      is_active: true,
    }),
    enabled: isOpen,
  });

  const { data: effectiveSettings } = useQuery<{ effective_settings: Record<string, unknown> }>({
    queryKey: ["effective-settings", activeBranchId],
    queryFn:  () => apiGet(`/branches/${activeBranchId}/effective-settings`),
    enabled:  isOpen && !!activeBranchId,
  });

  const masterStorageConditions  = (effectiveSettings?.effective_settings?.storage_conditions  as string[]) ?? [];
  const masterSpecialInstructions = (effectiveSettings?.effective_settings?.special_instructions as string[]) ?? [];
  const masterDosageInstructions  = (effectiveSettings?.effective_settings?.dosage_instructions  as string[]) ?? [];

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      const ai = editingGeneric.active_ingredients;
      const di = editingGeneric.drug_interactions;
      form.reset({
        name:                          editingGeneric.name,
        description:                   editingGeneric.description ?? "",
        dosage_form:                   editingGeneric.dosage_form ?? null,
        requires_prescription:         editingGeneric.requires_prescription ?? false,
        controlled_substance_schedule: editingGeneric.controlled_substance_schedule ?? "NONE",
        active_ingredients:            Array.isArray(ai) ? ai : ai ? [ai] : [],
        side_effects:                  editingGeneric.side_effects ?? [],
        drug_interactions:             Array.isArray(di) ? di : di ? [di] : [],
        local_license_number:          editingGeneric.local_license_number ?? "",
        storage_conditions:            editingGeneric.storage_conditions ?? [],
        special_instructions:          editingGeneric.special_instructions ?? [],
        dosage_instructions:           editingGeneric.dosage_instructions ?? [],
        stock_location_id:             editingGeneric.stock_location_id ?? null,
      });
    } else {
      form.reset(DEFAULT_VALUES);
    }
  }, [isOpen, isEditing, editingGeneric, form]);

  const mutation = useMutation({
    mutationFn: (data: GenericFormValues) =>
      isEditing
        ? apiPatch<ProductGeneric>(`/products/generics/${editingGeneric!.id}`, data)
        : apiPost<ProductGeneric>("/products/generics", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generics"] });
      showToast("success", isEditing ? "Generic Updated" : "Generic Created",
        isEditing ? `${editingGeneric!.name} has been updated.` : "New generic has been added.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  const errors = form.formState.errors;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Generic" : "New Generic"}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" onClick={form.handleSubmit((d) => mutation.mutate(d))} isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create Generic"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">

        {/* ── Basic Info ────────────────────────────────── */}
        <SectionHeader label="Basic Information" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name" placeholder="e.g. Paracetamol" required
            {...form.register("name")} error={errors.name?.message} />
          <div>
            <label className="form-label">Dosage Form</label>
            <select {...form.register("dosage_form")} className="form-select w-full">
              <option value="">— Select —</option>
              {DOSAGE_FORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="form-label">Description</label>
          <textarea placeholder="Optional description" rows={2}
            className="form-input resize-none" {...form.register("description")} />
        </div>

        {/* ── Regulatory ────────────────────────────────── */}
        <SectionHeader label="Regulatory" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 pt-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...form.register("requires_prescription")}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Requires Prescription</span>
            </label>
          </div>
          <div>
            <label className="form-label">Controlled Schedule</label>
            <select {...form.register("controlled_substance_schedule")} className="form-select w-full">
              {CONTROLLED_SCHEDULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Input label="License Number" placeholder="Local license no."
            {...form.register("local_license_number")} />
        </div>

        {/* ── Clinical ──────────────────────────────────── */}
        <SectionHeader label="Clinical" />
        <TagInput
          label="Active Ingredients"
          values={form.watch("active_ingredients") ?? []}
          onChange={(vals) => form.setValue("active_ingredients", vals, { shouldDirty: true })}
          placeholder="Type and press Enter..."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TagInput
            label="Drug Interactions"
            values={form.watch("drug_interactions") ?? []}
            onChange={(vals) => form.setValue("drug_interactions", vals, { shouldDirty: true })}
            placeholder="Type and press Enter..."
          />
          <MultiSelectFromList
            label="Side Effects"
            selected={form.watch("side_effects") ?? []}
            onChange={(vals) => form.setValue("side_effects", vals, { shouldDirty: true })}
            masterList={[]}
            allowCustom
          />
        </div>

        {/* ── Instructions ──────────────────────────────── */}
        <SectionHeader label="Instructions (from branch settings)" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MultiSelectFromList
            label="Storage Conditions"
            selected={form.watch("storage_conditions") ?? []}
            onChange={(vals) => form.setValue("storage_conditions", vals, { shouldDirty: true })}
            masterList={masterStorageConditions}
          />
          <MultiSelectFromList
            label="Special Instructions"
            selected={form.watch("special_instructions") ?? []}
            onChange={(vals) => form.setValue("special_instructions", vals, { shouldDirty: true })}
            masterList={masterSpecialInstructions}
          />
          <MultiSelectFromList
            label="Dosage Instructions"
            selected={form.watch("dosage_instructions") ?? []}
            onChange={(vals) => form.setValue("dosage_instructions", vals, { shouldDirty: true })}
            masterList={masterDosageInstructions}
          />
        </div>

        {/* ── Storage ───────────────────────────────────── */}
        <SectionHeader label="Storage" />
        <Controller
          name="stock_location_id"
          control={form.control}
          render={({ field }) => (
            <Autocomplete
              label="Default Stock Location"
              options={stockLocations.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }))}
              value={field.value ?? ""}
              onChange={(v) => field.onChange(v || null)}
              placeholder="Search stock locations..."
            />
          )}
        />
      </div>
    </Modal>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

interface TagInputProps {
  label:       string;
  values:      string[];
  onChange:    (values: string[]) => void;
  placeholder?: string;
}

function TagInput({ label, values, onChange, placeholder }: TagInputProps) {
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

  function removeItem(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="form-label">{label}</label>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="form-input w-full text-sm mb-1"
      />
      <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
        {values.map((tag, i) => (
          <span key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
            {tag}
            <button type="button" onClick={() => removeItem(i)} className="hover:text-danger-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

interface MultiSelectFromListProps {
  label:      string;
  selected:   string[];
  onChange:   (values: string[]) => void;
  masterList: string[];
  allowCustom?: boolean;
}

function MultiSelectFromList({ label, selected, onChange, masterList, allowCustom }: MultiSelectFromListProps) {
  const [inputValue, setInputValue] = useState("");
  const unselected = masterList.filter((item) => !selected.includes(item));

  function addItem(item: string) {
    if (item && !selected.includes(item)) {
      onChange([...selected, item]);
    }
  }

  function removeItem(index: number) {
    onChange(selected.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && allowCustom) {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed) addItem(trimmed);
      setInputValue("");
    }
  }

  return (
    <div>
      <label className="form-label">{label}</label>

      {unselected.length > 0 && (
        <select
          className="form-select w-full mb-1 text-xs"
          value=""
          onChange={(e) => { if (e.target.value) addItem(e.target.value); }}
        >
          <option value="">Select from list...</option>
          {unselected.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      )}

      {allowCustom && (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Or type custom + Enter"
          className="form-input text-xs w-full mb-1"
        />
      )}

      <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
        {selected.map((tag, i) => (
          <span key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
            {tag}
            <button type="button" onClick={() => removeItem(i)} className="hover:text-danger-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
