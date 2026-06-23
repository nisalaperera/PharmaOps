"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { LogoUpload } from "./LogoUpload";
import { chainGeneralSchema, type ChainGeneralFormValues } from "../schemas";
import type { Chain } from "@/types";

interface GeneralTabProps {
  chain: Chain;
}

export function GeneralTab({ chain }: GeneralTabProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ChainGeneralFormValues>({
    resolver: zodResolver(chainGeneralSchema),
    defaultValues: {
      name:         chain.name,
      chain_prefix: chain.chain_prefix,
    },
  });

  useEffect(() => {
    reset({
      name:         chain.name,
      chain_prefix: chain.chain_prefix,
    });
  }, [chain, reset]);

  const mutation = useMutation({
    mutationFn: (values: ChainGeneralFormValues) =>
      apiPatch<Chain>("/chain", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chain"] });
      showToast("success", "Organization Updated", "General settings have been saved.");
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Save Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  function handleLogoUploaded() {
    queryClient.invalidateQueries({ queryKey: ["chain"] });
  }

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-muted)" }}>
          Logo
        </p>
        <LogoUpload
          currentLogoUrl={chain.logo}
          uploadEndpoint="/chain/logo"
          onUploaded={handleLogoUploaded}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Organization Name"
          placeholder="e.g. Medi Guide Pharmacy"
          required
          {...register("name")}
          error={errors.name?.message}
        />
        <Input
          label="Chain Prefix"
          placeholder="e.g. MG"
          required
          helperText="Used in document numbering (e.g. MG/BR01/SI/...)"
          {...register("chain_prefix")}
          error={errors.chain_prefix?.message}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          variant="primary"
          isLoading={mutation.isPending}
          disabled={!isDirty}
        >
          Save Changes
        </Button>
      </div>
    </form>
  );
}
