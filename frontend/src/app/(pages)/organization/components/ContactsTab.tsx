"use client";

import { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { formatPhoneNumber } from "@/lib/utils";
import { ENTITY_CONTACT_TITLE_OPTIONS } from "@/lib/constants";
import { entityContactSchema } from "../schemas";
import type { Chain } from "@/types";

const contactsFormSchema = z.object({
  contacts: z.array(entityContactSchema),
});
type ContactsFormValues = z.infer<typeof contactsFormSchema>;

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

interface ContactsTabProps {
  chain: Chain;
}

export function ContactsTab({ chain }: ContactsTabProps) {
  const queryClient = useQueryClient();

  const form = useForm<ContactsFormValues>({
    resolver:      zodResolver(contactsFormSchema),
    defaultValues: { contacts: chain.contacts.length > 0 ? chain.contacts : [] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name:    "contacts",
    keyName: "rhfKey",
  });

  useEffect(() => {
    form.reset({ contacts: chain.contacts.length > 0 ? chain.contacts : [] });
  }, [chain, form]);

  const mutation = useMutation({
    mutationFn: (values: ContactsFormValues) =>
      apiPatch<Chain>("/chain", { contacts: values.contacts }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chain"] });
      showToast("success", "Contacts Saved", "Organization contacts have been updated.");
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Save Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          Contacts ({fields.length})
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => append({ ...EMPTY_CONTACT })}
        >
          Add Contact
        </Button>
      </div>

      {fields.length === 0 && (
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center"
          style={{ borderColor: "var(--color-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No contacts added yet. Click &ldquo;Add Contact&rdquo; to get started.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {fields.map((field, index) => {
          const contactErrors = errors.contacts?.[index];

          return (
            <div
              key={(field as Record<string, string>).rhfKey}
              className="rounded-xl border p-4 space-y-3"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  Contact {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      {...form.register(`contacts.${index}.is_active`)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                    />
                    <span style={{ color: "var(--color-text-muted)" }}>Active</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Input
                  label="Label / Role"
                  placeholder="e.g. Head Office"
                  required
                  {...form.register(`contacts.${index}.identifier`)}
                  error={contactErrors?.identifier?.message}
                />

                <div>
                  <label className="form-label">Title</label>
                  <select
                    {...form.register(`contacts.${index}.title`)}
                    className="form-select w-full"
                  >
                    {ENTITY_CONTACT_TITLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="First Name"
                  placeholder="First name"
                  required
                  {...form.register(`contacts.${index}.first_name`)}
                  error={contactErrors?.first_name?.message}
                />

                <Input
                  label="Last Name"
                  placeholder="Last name"
                  required
                  {...form.register(`contacts.${index}.last_name`)}
                  error={contactErrors?.last_name?.message}
                />

                <Controller
                  name={`contacts.${index}.mobile_1`}
                  control={form.control}
                  render={({ field: f }) => (
                    <Input
                      {...f}
                      label="Mobile 1"
                      placeholder="### ### ####"
                      required
                      maxLength={12}
                      onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))}
                      error={contactErrors?.mobile_1?.message}
                    />
                  )}
                />

                <Controller
                  name={`contacts.${index}.mobile_2`}
                  control={form.control}
                  render={({ field: f }) => (
                    <Input
                      {...f}
                      value={f.value ?? ""}
                      label="Mobile 2"
                      placeholder="### ### ####"
                      maxLength={12}
                      onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))}
                      error={contactErrors?.mobile_2?.message}
                    />
                  )}
                />

                <Controller
                  name={`contacts.${index}.whatsapp`}
                  control={form.control}
                  render={({ field: f }) => (
                    <Input
                      {...f}
                      value={f.value ?? ""}
                      label="WhatsApp"
                      placeholder="### ### ####"
                      maxLength={12}
                      onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))}
                      error={contactErrors?.whatsapp?.message}
                    />
                  )}
                />

                <Controller
                  name={`contacts.${index}.landline`}
                  control={form.control}
                  render={({ field: f }) => (
                    <Input
                      {...f}
                      value={f.value ?? ""}
                      label="Landline"
                      placeholder="### ### ####"
                      maxLength={12}
                      onChange={(e) => f.onChange(formatPhoneNumber(e.target.value))}
                      error={contactErrors?.landline?.message}
                    />
                  )}
                />

                <Input
                  label="Email"
                  placeholder="email@example.com"
                  type="email"
                  {...form.register(`contacts.${index}.email`)}
                  error={contactErrors?.email?.message}
                />
              </div>
            </div>
          );
        })}
      </div>

      {fields.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            isLoading={mutation.isPending}
          >
            Save Contacts
          </Button>
        </div>
      )}
    </form>
  );
}
