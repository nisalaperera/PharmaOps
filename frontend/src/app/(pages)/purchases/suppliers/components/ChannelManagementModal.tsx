"use client";

import { useEffect, useState } from "react";
import { useForm }          from "react-hook-form";
import { zodResolver }      from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }            from "@/components/ui/Modal";
import { Button }           from "@/components/ui/Button";
import { Badge }            from "@/components/ui/Badge";
import { apiPatch }         from "@/lib/api-client";
import { showToast }        from "@/lib/toast";
import { cn }               from "@/lib/utils";
import { SUPPLIER_TYPE_VARIANT, SUPPLIER_TYPE_LABEL } from "@/lib/badges";
import { ChannelFormSection }    from "./ChannelFormSection";
import { PromotionsFormSection } from "./PromotionsFormSection";
import {
  agencyChannelsMgmtSchema,
  distributorChannelsMgmtSchema,
  type AgencyChannelsMgmtValues,
  type DistributorChannelsMgmtValues,
} from "../schemas";
import type { Supplier } from "@/types";

type TabId = "channels" | "promotions";

interface ChannelManagementModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  supplier:  Supplier | null;
}

export function ChannelManagementModal({ isOpen, onClose, supplier }: ChannelManagementModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("channels");

  const isAgency = supplier?.supplier_type === "AGENCY";
  const schema   = isAgency ? agencyChannelsMgmtSchema : distributorChannelsMgmtSchema;

  const form = useForm<any>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!isOpen || !supplier) return;
    setActiveTab("channels");
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
      showToast("success", "Channels Saved", `Channels for ${supplier!.name} have been updated.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Save Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!supplier) return null;

  const channelType = isAgency ? "agency_channels" : "distributor_channels";
  const channels = isAgency ? (supplier.agency_channels ?? []) : (supplier.distributor_channels ?? []);
  const channelCount = channels.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Channels" size="xl">
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-4 -mt-1"
        style={{ background: "var(--color-surface-2)" }}
      >
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{supplier.name}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{supplier.legal_name}</p>
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

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4" style={{ borderColor: "var(--color-border)" }}>
        {(["channels", "promotions"] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-2 text-xs font-medium transition-colors -mb-px border-b-2",
              activeTab === tab
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent hover:border-[var(--color-border)]"
            )}
            style={{ color: activeTab === tab ? undefined : "var(--color-text-muted)" }}
          >
            {tab === "channels" ? "Channels" : "Promotions"}
          </button>
        ))}
      </div>

      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">

        {activeTab === "channels" && (
          <ChannelFormSection
            supplierType={supplier.supplier_type}
            control={form.control}
            register={form.register}
            errors={form.formState.errors}
          />
        )}

        {activeTab === "promotions" && (
          <div className="space-y-6">
            {channelCount === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: "var(--color-text-muted)" }}>
                Add channels first, then manage promotions per channel.
              </p>
            ) : (
              (form.watch(channelType) ?? []).map((_: unknown, chIdx: number) => {
                const chName = form.watch(`${channelType}.${chIdx}.channel_name`) || `Channel ${chIdx + 1}`;
                return (
                  <div key={chIdx}>
                    <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
                      {chName}
                    </p>
                    <PromotionsFormSection
                      channelType={channelType as "agency_channels" | "distributor_channels"}
                      channelIndex={chIdx}
                      control={form.control}
                      register={form.register}
                      watch={form.watch}
                      errors={form.formState.errors}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
