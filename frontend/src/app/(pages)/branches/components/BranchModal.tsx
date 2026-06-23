"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost, apiPatch, apiGet } from "@/lib/api-client";
import { formatPhoneNumber, cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import { ENTITY_CONTACT_TITLE_OPTIONS, CURRENCY_OPTIONS } from "@/lib/constants";
import { branchSchema, type BranchFormValues } from "@/app/(pages)/branches/schemas";
import { LogoUpload } from "@/app/(pages)/organization/components/LogoUpload";
import type { Branch, Chain, ChainSettings } from "@/types";

type TabId = "general" | "contacts" | "settings" | "hr";

const TABS: { id: TabId; label: string }[] = [
  { id: "general",  label: "General"  },
  { id: "contacts", label: "Contacts" },
  { id: "settings", label: "Settings" },
  { id: "hr",       label: "HR Params" },
];

interface BranchModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  editingBranch: Branch | null;
}

const EMPTY_CONTACT = {
  identifier: "",
  title:      "Mr." as const,
  first_name: "",
  last_name:  "",
  mobile_1:   "",
  mobile_2:   "",
  whatsapp:   "",
  landline:   "",
  email:      "",
  is_active:  true,
};

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

function InheritedHint({ value }: { label?: string; value: string | number | boolean | undefined | null }) {
  if (value === undefined || value === null) return null;
  const displayValue = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
      Inherited: {displayValue}
    </span>
  );
}

export function BranchModal({ isOpen, onClose, editingBranch }: BranchModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingBranch !== null;
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const { data: chain } = useQuery<Chain>({
    queryKey: ["chain"],
    queryFn:  () => apiGet<Chain>("/chain"),
    enabled:  isOpen,
  });
  const chainSettings: ChainSettings | undefined = chain?.settings;

  const form = useForm<BranchFormValues>({
    resolver:      zodResolver(branchSchema),
    defaultValues: {
      name: "", address: "", license_number: "", branch_prefix: "",
      branch_manager: null,
      contacts: [], settings: null, hr_params: null, is_active: true,
    },
  });

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({
    control: form.control,
    name: "contacts",
    keyName: "rhfKey",
  });

  const { fields: slabFields, append: appendSlab, remove: removeSlab } = useFieldArray({
    control: form.control,
    name: "hr_params.paye_tax_slabs" as any,
  });

  const watchedIsActive = useWatch({ control: form.control, name: "is_active" });

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab("general");
    if (isEditing) {
      form.reset({
        name:                   editingBranch.name,
        address:                editingBranch.address,
        license_number:         editingBranch.license_number,
        branch_prefix:          editingBranch.branch_prefix ?? "",
        branch_manager:         editingBranch.branch_manager ?? null,
        contacts:               editingBranch.contacts ?? [],
        settings:               editingBranch.settings ?? null,
        hr_params:              editingBranch.hr_params ?? null,
        is_active:              editingBranch.is_active,
      });
    } else {
      form.reset({
        name: "", address: "", license_number: "", branch_prefix: "",
        branch_manager: null,
        contacts: [], settings: null, hr_params: null, is_active: true,
      });
    }
  }, [isOpen, isEditing, editingBranch, form]);

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

  const errors = form.formState.errors;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Branch" : "New Branch"}
      size="xl"
      headerExtra={
        <ActiveToggle
          value={watchedIsActive}
          onChange={(v) => form.setValue("is_active", v, { shouldDirty: true })}
        />
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={form.handleSubmit((data) => mutation.mutate(data))}
            isLoading={mutation.isPending}
          >
            {isEditing ? "Save Changes" : "Create Branch"}
          </Button>
        </>
      }
    >
      {/* Tabs */}
      <div className="flex gap-1 border-b -mx-6 px-6 mb-4" style={{ borderColor: "var(--color-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-2 text-xs font-medium transition-colors -mb-px border-b-2",
              activeTab === tab.id
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent hover:border-[var(--color-border)]"
            )}
            style={{ color: activeTab === tab.id ? undefined : "var(--color-text-muted)" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ──────────────────────────────────────────── */}
      {activeTab === "general" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Branch Name" placeholder="e.g. Colombo Main Branch" required
              {...form.register("name")} error={errors.name?.message} />
            <Input label="Branch Prefix" placeholder="e.g. BR01" maxLength={10}
              helperText="Used in document numbering"
              {...form.register("branch_prefix")} error={errors.branch_prefix?.message} />
          </div>
          <Input label="Address" placeholder="Full address of the branch" required
            {...form.register("address")} error={errors.address?.message} />
          <Input label="License Number" placeholder="e.g. PHARM-2024-001" required
            {...form.register("license_number")} error={errors.license_number?.message} />

          {isEditing && (
            <LogoUpload
              currentLogoUrl={form.watch("settings.logo" as any) ?? editingBranch?.settings?.logo}
              uploadEndpoint={`/branches/${editingBranch!.id}/logo`}
              onUploaded={(url) => {
                form.setValue("settings.logo" as any, url, { shouldDirty: true });
                queryClient.invalidateQueries({ queryKey: ["branches"] });
              }}
            />
          )}
        </div>
      )}

      {/* ── Contacts Tab ─────────────────────────────────────────── */}
      {activeTab === "contacts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Contacts ({contactFields.length})
            </p>
            <Button type="button" variant="outline" size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => appendContact({ ...EMPTY_CONTACT })}
            >
              Add Contact
            </Button>
          </div>

          {contactFields.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-6 text-center" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                No contacts added yet.
              </p>
            </div>
          )}

          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {contactFields.map((field, index) => {
              const contactErrors = errors.contacts?.[index];
              return (
                <div key={(field as Record<string, string>).rhfKey}
                  className="rounded-xl border p-3 space-y-3"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Contact {index + 1}</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" {...form.register(`contacts.${index}.is_active`)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5" />
                        <span style={{ color: "var(--color-text-muted)" }}>Active</span>
                      </label>
                      <button type="button" onClick={() => removeContact(index)}
                        className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <Input label="Label" placeholder="e.g. Pharmacist" required
                      {...form.register(`contacts.${index}.identifier`)} error={contactErrors?.identifier?.message} />
                    <div>
                      <label className="form-label">Title</label>
                      <select {...form.register(`contacts.${index}.title`)} className="form-select w-full">
                        {ENTITY_CONTACT_TITLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <Input label="First Name" placeholder="First name" required
                      {...form.register(`contacts.${index}.first_name`)} error={contactErrors?.first_name?.message} />
                    <Input label="Last Name" placeholder="Last name" required
                      {...form.register(`contacts.${index}.last_name`)} error={contactErrors?.last_name?.message} />
                    <Controller name={`contacts.${index}.mobile_1`} control={form.control}
                      render={({ field: f }) => (
                        <Input {...f} label="Mobile 1" placeholder="### ### ####" required maxLength={12}
                          onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))} error={contactErrors?.mobile_1?.message} />
                      )} />
                    <Controller name={`contacts.${index}.mobile_2`} control={form.control}
                      render={({ field: f }) => (
                        <Input {...f} value={f.value ?? ""} label="Mobile 2" placeholder="### ### ####" maxLength={12}
                          onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))} error={contactErrors?.mobile_2?.message} />
                      )} />
                    <Controller name={`contacts.${index}.whatsapp`} control={form.control}
                      render={({ field: f }) => (
                        <Input {...f} value={f.value ?? ""} label="WhatsApp" placeholder="### ### ####" maxLength={12}
                          onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))} error={contactErrors?.whatsapp?.message} />
                      )} />
                    <Controller name={`contacts.${index}.landline`} control={form.control}
                      render={({ field: f }) => (
                        <Input {...f} value={f.value ?? ""} label="Landline" placeholder="### ### ####" maxLength={12}
                          onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))} error={contactErrors?.landline?.message} />
                      )} />
                    <Input label="Email" placeholder="email@example.com" type="email"
                      {...form.register(`contacts.${index}.email`)} error={contactErrors?.email?.message} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Settings Tab ─────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="space-y-5">
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Leave fields empty to inherit the organization default.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="form-label">
                Currency <InheritedHint label="Currency" value={chainSettings?.default_currency} />
              </label>
              <select {...form.register("settings.currency" as any)} className="form-select w-full">
                <option value="">Inherit from Organization</option>
                {CURRENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">
                Low Stock Threshold <InheritedHint label="" value={chainSettings?.low_stock_threshold} />
              </label>
              <input type="number" {...form.register("settings.low_stock_threshold" as any)} className="form-input w-full"
                placeholder={chainSettings?.low_stock_threshold?.toString() ?? ""} />
            </div>

            <div>
              <label className="form-label">
                Expiry Alert Days <InheritedHint label="" value={chainSettings?.expiry_alert_days} />
              </label>
              <input type="number" {...form.register("settings.expiry_alert_days" as any)} className="form-input w-full"
                placeholder={chainSettings?.expiry_alert_days?.toString() ?? ""} />
            </div>

            <div>
              <label className="form-label">
                Loyalty Points Rate <InheritedHint label="" value={chainSettings?.loyalty_points_rate} />
              </label>
              <input type="number" step="0.01" {...form.register("settings.loyalty_points_rate" as any)} className="form-input w-full"
                placeholder={chainSettings?.loyalty_points_rate?.toString() ?? "Not set"} />
            </div>

            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...form.register("settings.tax_enabled" as any)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
                <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Tax Enabled</span>
              </label>
              <InheritedHint label="" value={chainSettings?.tax_enabled} />
            </div>

            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...form.register("settings.is_discount_applicable" as any)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
                <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Discount Applicable</span>
              </label>
              <InheritedHint label="" value={chainSettings?.is_discount_applicable} />
            </div>
          </div>

          <div>
            <label className="form-label">Invoice Footer Text</label>
            <input type="text" {...form.register("settings.invoice_footer_text" as any)} className="form-input w-full"
              placeholder={chainSettings?.invoice_footer_text ?? "Inherit from Organization"} />
          </div>

          <SettingsTagListField
            label="Storage Conditions"
            values={form.watch("settings.storage_conditions" as any) ?? []}
            inherited={chainSettings?.storage_conditions}
            onChange={(vals) => form.setValue("settings.storage_conditions" as any, vals, { shouldDirty: true })}
          />
          <SettingsTagListField
            label="Special Instructions"
            values={form.watch("settings.special_instructions" as any) ?? []}
            inherited={chainSettings?.special_instructions}
            onChange={(vals) => form.setValue("settings.special_instructions" as any, vals, { shouldDirty: true })}
          />
          <SettingsTagListField
            label="Dosage Instructions"
            values={form.watch("settings.dosage_instructions" as any) ?? []}
            inherited={chainSettings?.dosage_instructions}
            onChange={(vals) => form.setValue("settings.dosage_instructions" as any, vals, { shouldDirty: true })}
          />
        </div>
      )}

      {/* ── HR Params Tab ────────────────────────────────────────── */}
      {activeTab === "hr" && (
        <div className="space-y-5">
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Leave fields empty to inherit the organization default.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="form-label">
                Standard Daily Hours <InheritedHint label="" value={chain?.hr_params?.standard_daily_hours} />
              </label>
              <input type="number" step="0.5" {...form.register("hr_params.standard_daily_hours" as any)} className="form-input w-full"
                placeholder={chain?.hr_params?.standard_daily_hours?.toString() ?? ""} />
            </div>
            <div>
              <label className="form-label">
                Working Days / Month <InheritedHint label="" value={chain?.hr_params?.working_days_per_month} />
              </label>
              <input type="number" {...form.register("hr_params.working_days_per_month" as any)} className="form-input w-full"
                placeholder={chain?.hr_params?.working_days_per_month?.toString() ?? ""} />
            </div>
            <div>
              <label className="form-label">
                OT Rate Multiplier <InheritedHint label="" value={chain?.hr_params?.ot_rate_multiplier} />
              </label>
              <input type="number" step="0.1" {...form.register("hr_params.ot_rate_multiplier" as any)} className="form-input w-full"
                placeholder={chain?.hr_params?.ot_rate_multiplier?.toString() ?? ""} />
            </div>
            <div>
              <label className="form-label">
                EPF Employee Rate (%) <InheritedHint label="" value={chain?.hr_params?.epf_employee_rate} />
              </label>
              <input type="number" step="0.1" {...form.register("hr_params.epf_employee_rate" as any)} className="form-input w-full"
                placeholder={chain?.hr_params?.epf_employee_rate?.toString() ?? ""} />
            </div>
            <div>
              <label className="form-label">
                EPF Employer Rate (%) <InheritedHint label="" value={chain?.hr_params?.epf_employer_rate} />
              </label>
              <input type="number" step="0.1" {...form.register("hr_params.epf_employer_rate" as any)} className="form-input w-full"
                placeholder={chain?.hr_params?.epf_employer_rate?.toString() ?? ""} />
            </div>
            <div>
              <label className="form-label">
                ETF Employer Rate (%) <InheritedHint label="" value={chain?.hr_params?.etf_employer_rate} />
              </label>
              <input type="number" step="0.1" {...form.register("hr_params.etf_employer_rate" as any)} className="form-input w-full"
                placeholder={chain?.hr_params?.etf_employer_rate?.toString() ?? ""} />
            </div>
          </div>

          {/* PAYE Slabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                PAYE Tax Slabs
                {chain?.hr_params?.paye_tax_slabs && chain.hr_params.paye_tax_slabs.length > 0 && (
                  <span className="ml-2 font-normal normal-case">
                    (Org has {chain.hr_params.paye_tax_slabs.length} slab{chain.hr_params.paye_tax_slabs.length !== 1 ? "s" : ""})
                  </span>
                )}
              </span>
              <Button type="button" variant="outline" size="sm"
                leftIcon={<Plus className="w-3 h-3" />}
                onClick={() => appendSlab({ min_amount: 0, max_amount: null, rate_percent: 0, fixed_amount: 0 })}
              >
                Add Slab
              </Button>
            </div>

            {slabFields.length === 0 && (
              <p className="text-xs py-2 text-center" style={{ color: "var(--color-text-muted)" }}>
                No branch-level tax slabs. Organization defaults will apply.
              </p>
            )}

            {slabFields.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--color-surface-2)" }}>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Min</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Max</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Rate (%)</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Fixed</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {slabFields.map((slab, idx) => (
                      <tr key={slab.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.01" {...form.register(`hr_params.paye_tax_slabs.${idx}.min_amount` as any)} className="form-input text-xs w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.01" placeholder="No limit" {...form.register(`hr_params.paye_tax_slabs.${idx}.max_amount` as any)} className="form-input text-xs w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.1" {...form.register(`hr_params.paye_tax_slabs.${idx}.rate_percent` as any)} className="form-input text-xs w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.01" {...form.register(`hr_params.paye_tax_slabs.${idx}.fixed_amount` as any)} className="form-input text-xs w-full" />
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
        </div>
      )}
    </Modal>
  );
}

// ─── Tag list for settings tab ──────────────────────────────────────────────

interface SettingsTagListFieldProps {
  label:     string;
  values:    string[];
  inherited?: string[];
  onChange:  (values: string[]) => void;
}

function SettingsTagListField({ label, values, inherited, onChange }: SettingsTagListFieldProps) {
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
      <label className="form-label">
        {label}
        {inherited && inherited.length > 0 && (
          <span className="ml-2 font-normal text-xs" style={{ color: "var(--color-text-muted)" }}>
            (Org: {inherited.length} item{inherited.length !== 1 ? "s" : ""})
          </span>
        )}
      </label>
      <div
        className="flex flex-wrap gap-1.5 p-2 rounded-lg border min-h-[2.25rem]"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {values.map((tag, i) => (
          <span key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
          >
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
          placeholder={values.length === 0 ? "Type and press Enter" : ""}
          className="flex-1 min-w-[100px] text-xs bg-transparent outline-none"
          style={{ color: "var(--color-text)" }}
        />
      </div>
    </div>
  );
}
