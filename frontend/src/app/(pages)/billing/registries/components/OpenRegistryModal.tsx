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
import {
  openRegistrySchema,
  type OpenRegistryValues,
} from "@/app/(pages)/billing/registries/schemas";
import type { CashRegistry } from "@/types";

interface OpenRegistryModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  registry: CashRegistry | null;
}

export function OpenRegistryModal({ isOpen, onClose, registry }: OpenRegistryModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<OpenRegistryValues>({
    resolver:      zodResolver(openRegistrySchema),
    defaultValues: {
      opening_balance: 0,
      notes:           "",
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      opening_balance: 0,
      notes:           "",
    });
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMutation = useMutation({
    mutationFn: (values: OpenRegistryValues) =>
      apiPost<CashRegistry>(`/treasury/registries/${registry!.id}/open`, values),
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      showToast(
        "success",
        "Registry Opened",
        `${registry!.name} is now open with balance LKR ${values.opening_balance.toFixed(2)}`
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Open Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!registry) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Open Registry — ${registry.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={openMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={form.handleSubmit((values) => openMutation.mutate(values))}
            isLoading={openMutation.isPending}
          >
            Open Registry
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Opening Balance */}
        <Input
          label="Opening Balance"
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          required
          error={form.formState.errors.opening_balance?.message}
          helperText={
            registry.current_balance > 0
              ? `Current balance: LKR ${registry.current_balance.toFixed(2)}`
              : undefined
          }
          {...form.register("opening_balance", { valueAsNumber: true })}
        />

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            rows={3}
            placeholder="Optional opening notes…"
            className="form-input resize-none"
            {...form.register("notes")}
          />
        </div>

      </div>
    </Modal>
  );
}
