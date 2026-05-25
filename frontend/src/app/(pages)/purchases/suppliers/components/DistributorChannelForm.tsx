"use client";

import { useQuery }                              from "@tanstack/react-query";
import { useWatch }                              from "react-hook-form";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { Input }                from "@/components/ui/Input";
import { ContactFormSection }   from "./ContactFormSection";
import { ProductMappingSection } from "./ProductMappingSection";
import { CHANNEL_CATEGORY_OPTIONS, DELIVERY_FREQUENCY_OPTIONS } from "@/lib/constants";
import { apiGet }               from "@/lib/api-client";
import type { SupplierAgencyOption } from "@/types";

interface DistributorChannelFormProps {
  index:    number;
  control:  Control<any>;
  register: UseFormRegister<any>;
  errors:   FieldErrors<any>;
}

export function DistributorChannelForm({ index, control, register, errors }: DistributorChannelFormProps) {
  const channelPath    = `distributor_channels.${index}` as const;
  const channelErrors  = (errors as any)?.distributor_channels?.[index];
  const channelCategory = useWatch({ control, name: `${channelPath}.channel_category` as any });

  const { data: agencies = [] } = useQuery<SupplierAgencyOption[]>({
    queryKey: ["agencies"],
    queryFn:  () => apiGet<SupplierAgencyOption[]>("/suppliers/agencies"),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Channel Name"
          placeholder="e.g. Direct, Sub-Distributor A"
          {...register(`${channelPath}.channel_name` as any)}
          error={channelErrors?.channel_name?.message}
        />

        {/* Channel Category */}
        <div>
          <label className="form-label">Channel Category</label>
          <select
            {...register(`${channelPath}.channel_category` as any)}
            className="form-select w-full"
          >
            {CHANNEL_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {channelErrors?.channel_category?.message && (
            <p className="mt-1 text-xs text-danger-500">{channelErrors.channel_category.message}</p>
          )}
        </div>

        {/* Agency dropdown — visible only when category is AGENCY */}
        {channelCategory === "AGENCY" && (
          <div>
            <label className="form-label">Linked Agency</label>
            <select
              {...register(`${channelPath}.agency_id` as any)}
              className="form-select w-full"
            >
              <option value="">Select agency…</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>{a.short_name}</option>
              ))}
            </select>
            {channelErrors?.agency_id?.message && (
              <p className="mt-1 text-xs text-danger-500">{channelErrors.agency_id.message}</p>
            )}
          </div>
        )}

        {/* Credit Term */}
        <Input
          label="Credit Term (days)"
          type="number"
          min={0}
          {...register(`${channelPath}.credit_term_days` as any, { valueAsNumber: true })}
          error={channelErrors?.credit_term_days?.message}
        />

        {/* Delivery Frequency */}
        <div>
          <label className="form-label">Delivery Frequency</label>
          <select
            {...register(`${channelPath}.delivery_frequency` as any)}
            className="form-select w-full"
          >
            {DELIVERY_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {channelErrors?.delivery_frequency?.message && (
            <p className="mt-1 text-xs text-danger-500">{channelErrors.delivery_frequency.message}</p>
          )}
        </div>
      </div>

      <ProductMappingSection channelPath={channelPath} control={control} />

      <ContactFormSection
        channelPath={channelPath}
        control={control}
        register={register}
        errors={errors}
      />
    </div>
  );
}
