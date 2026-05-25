"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { apiPost } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  closeRegistrySchema,
  type CloseRegistryValues,
} from "@/app/(pages)/billing/registries/schemas";
import type { CashRegistry } from "@/types";

interface CloseRegistryModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  registry: CashRegistry | null;
}

export function CloseRegistryModal({ isOpen, onClose, registry }: CloseRegistryModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<CloseRegistryValues>({
    resolver:      zodResolver(closeRegistrySchema),
    defaultValues: {
      physical_count: 0,
      notes:          "",
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      physical_count: 0,
      notes:          "",
    });
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const physicalCountWatched = form.watch("physical_count");
  const systemBalance        = registry?.current_balance ?? 0;
  const discrepancy          = (physicalCountWatched ?? 0) - systemBalance;

  const closeMutation = useMutation({
    mutationFn: (values: CloseRegistryValues) =>
      apiPost<CashRegistry>(`/treasury/registries/${registry!.id}/close`, values),
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      const discrepancyAmount = (values.physical_count - systemBalance).toFixed(2);
      const discrepancyLabel  =
        values.physical_count > systemBalance
          ? `+LKR ${discrepancyAmount}`
          : values.physical_count < systemBalance
          ? `-LKR ${Math.abs(Number(discrepancyAmount)).toFixed(2)}`
          : "No discrepancy";
      showToast(
        "success",
        "Registry Closed",
        `${registry!.name} has been closed. Discrepancy: ${discrepancyLabel}`
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Close Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!registry) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Close Registry — ${registry.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={closeMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={form.handleSubmit((values) => closeMutation.mutate(values))}
            isLoading={closeMutation.isPending}
          >
            Close Registry
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* System Balance — read-only display */}
        <div>
          <p className="form-label">System Balance</p>
          <div
            className="form-input bg-[var(--color-surface-2)] cursor-not-allowed tabular-nums font-medium"
            style={{ color: "var(--color-text)" }}
          >
            LKR {systemBalance.toFixed(2)}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            This is the system&apos;s calculated closing balance.
          </p>
        </div>

        {/* Physical Count */}
        <Input
          label="Physical Count"
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          required
          error={form.formState.errors.physical_count?.message}
          {...form.register("physical_count", { valueAsNumber: true })}
        />

        {/* Discrepancy — computed, read-only */}
        <div>
          <p className="form-label">Discrepancy</p>
          <div
            className={cn(
              "form-input bg-[var(--color-surface-2)] cursor-not-allowed tabular-nums font-semibold",
              discrepancy > 0 && "text-emerald-600 dark:text-emerald-400",
              discrepancy < 0 && "text-danger-600 dark:text-danger-400",
              discrepancy === 0 && "text-[var(--color-text-muted)]"
            )}
          >
            {discrepancy > 0
              ? `+LKR ${discrepancy.toFixed(2)}`
              : discrepancy < 0
              ? `-LKR ${Math.abs(discrepancy).toFixed(2)}`
              : "LKR 0.00"}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            Physical Count − System Balance
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            rows={3}
            placeholder="Optional closing notes…"
            className="form-input resize-none"
            {...form.register("notes")}
          />
        </div>

      </div>
    </Modal>
  );
}
