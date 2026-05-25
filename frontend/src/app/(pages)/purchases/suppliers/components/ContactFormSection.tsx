"use client";

import { useFieldArray, Controller } from "react-hook-form";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { formatPhoneNumber } from "@/lib/utils";
import { CONTACT_TITLE_OPTIONS, CONTACT_TYPE_OPTIONS } from "@/lib/constants";

type ChannelPath =
  | `agency_channels.${number}`
  | `distributor_channels.${number}`;

interface ContactFormSectionProps {
  channelPath: ChannelPath;
  control:     Control<any>;
  register:    UseFormRegister<any>;
  errors:      FieldErrors<any>;
}

const EMPTY_CONTACT = {
  title:        "Mr." as const,
  first_name:   "",
  last_name:    "",
  landline:     "",
  mobile:       "",
  whatsapp:     "",
  contact_type: "SALES" as const,
};

export function ContactFormSection({
  channelPath,
  control,
  register,
  errors,
}: ContactFormSectionProps) {
  const contactsPath = `${channelPath}.contacts` as const;

  const { fields, append, remove } = useFieldArray({
    control,
    name:    contactsPath as any,
    keyName: "rhfKey",
  });

  function getContactErrors(index: number): any {
    const parts = channelPath.split(".");
    const channelType = parts[0] as "agency_channels" | "distributor_channels";
    const channelIndex = Number(parts[1]);
    return (errors as any)?.[channelType]?.[channelIndex]?.contacts?.[index];
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          Contacts
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<Plus className="w-3 h-3" />}
          onClick={() => append({ ...EMPTY_CONTACT })}
        >
          Add Contact
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs py-2 text-center" style={{ color: "var(--color-text-muted)" }}>
          No contacts added. At least one contact is required.
        </p>
      )}

      <div className="space-y-3">
        {fields.map((field, index) => {
          const contactErrors = getContactErrors(index);
          const basePath = `${contactsPath}.${index}` as any;

          return (
            <div
              key={(field as any).rhfKey}
              className="rounded-lg border p-3 space-y-3"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  Contact {index + 1}
                </span>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

                {/* Title */}
                <div>
                  <label className="form-label">Title</label>
                  <select
                    {...register(`${basePath}.title`)}
                    className="form-select w-full"
                  >
                    {CONTACT_TITLE_OPTIONS.filter((o) => o.value !== "").map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* First Name */}
                <Input
                  label="First Name"
                  placeholder="First name"
                  {...register(`${basePath}.first_name`)}
                  error={contactErrors?.first_name?.message}
                />

                {/* Last Name */}
                <Input
                  label="Last Name"
                  placeholder="Last name"
                  {...register(`${basePath}.last_name`)}
                  error={contactErrors?.last_name?.message}
                />

                {/* Mobile */}
                <Controller
                  name={`${basePath}.mobile`}
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      label="Mobile"
                      placeholder="### ### ####"
                      maxLength={12}
                      onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                      error={contactErrors?.mobile?.message}
                    />
                  )}
                />

                {/* Landline */}
                <Controller
                  name={`${basePath}.landline`}
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      label="Landline"
                      placeholder="### ### ####"
                      maxLength={12}
                      onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                      error={contactErrors?.landline?.message}
                    />
                  )}
                />

                {/* WhatsApp */}
                <Controller
                  name={`${basePath}.whatsapp`}
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      label="WhatsApp"
                      placeholder="### ### ####"
                      maxLength={12}
                      onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                      error={contactErrors?.whatsapp?.message}
                    />
                  )}
                />

                {/* Contact Type */}
                <div>
                  <label className="form-label">Type</label>
                  <select
                    {...register(`${basePath}.contact_type`)}
                    className="form-select w-full"
                  >
                    {CONTACT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
