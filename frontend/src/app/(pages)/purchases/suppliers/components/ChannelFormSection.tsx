"use client";

import { useFieldArray }                         from "react-hook-form";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { Plus, Trash2 }   from "lucide-react";
import { Button }         from "@/components/ui/Button";
import { AgencyChannelForm }      from "./AgencyChannelForm";
import { DistributorChannelForm } from "./DistributorChannelForm";
import type { AgencyChannelValues, DistributorChannelValues } from "../schemas";
import type { SupplierType } from "@/types";

interface ChannelFormSectionProps {
  supplierType: SupplierType;
  control:      Control<any>;
  register:     UseFormRegister<any>;
  errors:       FieldErrors<any>;
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

const EMPTY_AGENCY_CHANNEL: AgencyChannelValues = {
  channel_name:     "",
  contacts:         [{ ...EMPTY_CONTACT }],
  product_mappings: [],
};

const EMPTY_DISTRIBUTOR_CHANNEL: DistributorChannelValues = {
  channel_name:       "",
  channel_category:   "SUB",
  agency_id:          "",
  agency_name:        "",
  credit_term_days:   30,
  delivery_frequency: "WEEKLY",
  contacts:           [{ ...EMPTY_CONTACT }],
  product_mappings:   [],
};

export function ChannelFormSection({ supplierType, control, register, errors }: ChannelFormSectionProps) {
  const isAgency      = supplierType === "AGENCY";
  const fieldArrayName = isAgency ? "agency_channels" : "distributor_channels";

  const { fields, append, remove } = useFieldArray({
    control,
    name:    fieldArrayName as any,
    keyName: "rhfKey",
  });

  const channelErrors = (errors as any)?.[fieldArrayName];

  function addChannel() {
    if (isAgency) {
      (append as any)({ ...EMPTY_AGENCY_CHANNEL });
    } else {
      (append as any)({ ...EMPTY_DISTRIBUTOR_CHANNEL });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          {isAgency ? "Agency Channels" : "Distribution Channels"}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={addChannel}
        >
          Add Channel
        </Button>
      </div>

      {typeof channelErrors?.message === "string" && (
        <p className="text-xs text-danger-500 mb-2">{channelErrors.message}</p>
      )}
      {channelErrors?.root?.message && (
        <p className="text-xs text-danger-500 mb-2">{channelErrors.root.message}</p>
      )}

      <div className="space-y-4">
        {fields.map((field, index) => (
          <div
            key={(field as any).rhfKey}
            className="rounded-lg border p-4 space-y-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Channel {index + 1}
              </span>
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

            {isAgency ? (
              <AgencyChannelForm
                index={index}
                control={control}
                register={register}
                errors={errors}
              />
            ) : (
              <DistributorChannelForm
                index={index}
                control={control}
                register={register}
                errors={errors}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
