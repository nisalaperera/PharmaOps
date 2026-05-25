"use client";

import { useEffect }        from "react";
import { useForm }          from "react-hook-form";
import { zodResolver }      from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }            from "@/components/ui/Modal";
import { Button }           from "@/components/ui/Button";
import { Badge }            from "@/components/ui/Badge";
import { apiPatch }         from "@/lib/api-client";
import { showToast }        from "@/lib/toast";
import { SUPPLIER_TYPE_VARIANT, SUPPLIER_TYPE_LABEL } from "@/lib/badges";
import { ChannelFormSection } from "./ChannelFormSection";
import {
  agencyChannelsMgmtSchema,
  distributorChannelsMgmtSchema,
  type AgencyChannelsMgmtValues,
  type DistributorChannelsMgmtValues,
} from "../schemas";
import type { Supplier } from "@/types";

interface ChannelManagementModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  supplier:  Supplier | null;
}

export function ChannelManagementModal({ isOpen, onClose, supplier }: ChannelManagementModalProps) {
  const queryClient = useQueryClient();

  const isAgency = supplier?.supplier_type === "AGENCY";
  const schema   = isAgency ? agencyChannelsMgmtSchema : distributorChannelsMgmtSchema;

  const form = useForm<any>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!isOpen || !supplier) return;
    if (supplier.supplier_type === "AGENCY") {
      form.reset({ agency_channels: supplier.agency_channels ?? [] });
    } else {
      form.reset({ distributor_channels: supplier.distributor_channels ?? [] });
    }
  }, [isOpen, supplier]);

  const mutation = useMutation({
    mutationFn: (values: AgencyChannelsMgmtValues | DistributorChannelsMgmtValues) =>
      apiPatch<Supplier>(`/suppliers/${supplier!.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      showToast("success", "Channels Saved", `Channels for ${supplier!.short_name} have been updated.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Save Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!supplier) return null;

  const channelCount = isAgency
    ? (supplier.agency_channels?.length ?? 0)
    : (supplier.distributor_channels?.length ?? 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Channels"
      size="xl"
    >
      {/* ── Supplier context header ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-4 -mt-1"
        style={{ background: "var(--color-surface-2)" }}
      >
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {supplier.short_name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {supplier.legal_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={SUPPLIER_TYPE_VARIANT[supplier.supplier_type]}>
            {SUPPLIER_TYPE_LABEL[supplier.supplier_type]}
          </Badge>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
            {channelCount} channel{channelCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Channel form ────────────────────────────────────────────────── */}
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <ChannelFormSection
          supplierType={supplier.supplier_type}
          control={form.control}
          register={form.register}
          errors={form.formState.errors}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            Save Channels
          </Button>
        </div>
      </form>
    </Modal>
  );
}
