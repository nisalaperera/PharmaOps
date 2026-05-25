"use client";

import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import { ContactFormSection }   from "./ContactFormSection";
import { ProductMappingSection } from "./ProductMappingSection";

interface AgencyChannelFormProps {
  index:    number;
  control:  Control<any>;
  register: UseFormRegister<any>;
  errors:   FieldErrors<any>;
}

export function AgencyChannelForm({ index, control, register, errors }: AgencyChannelFormProps) {
  const channelPath = `agency_channels.${index}` as const;
  const channelErrors = (errors as any)?.agency_channels?.[index];

  return (
    <div className="space-y-4">
      <Input
        label="Channel Name"
        placeholder="e.g. North Region, Online"
        {...register(`${channelPath}.channel_name` as any)}
        error={channelErrors?.channel_name?.message}
      />

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
