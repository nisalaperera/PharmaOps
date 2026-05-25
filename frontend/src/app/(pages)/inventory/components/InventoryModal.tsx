"use client";

import { useEffect } from "react";
import { useForm }   from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }     from "@/components/ui/Modal";
import { Button }    from "@/components/ui/Button";
import { Input }     from "@/components/ui/Input";
import { apiPatch }  from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { inventoryEditSchema, type InventoryEditValues } from "../schemas";
import type { InventoryItem } from "@/types";

interface InventoryModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  editingItem: InventoryItem | null;
}

export function InventoryModal({ isOpen, onClose, editingItem }: InventoryModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<InventoryEditValues>({
    resolver:      zodResolver(inventoryEditSchema),
    defaultValues: { min_stock_level: 0 },
  });

  useEffect(() => {
    if (!isOpen || !editingItem) return;
    form.reset({ min_stock_level: editingItem.min_stock_level });
  }, [isOpen, editingItem]);

  const mutation = useMutation({
    mutationFn: (values: InventoryEditValues) =>
      apiPatch<InventoryItem>(`/inventory/${editingItem!.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast(
        "success",
        "Min Stock Level Updated",
        `${editingItem?.product_name} threshold has been updated.`
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Min Stock Level" size="sm">
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <div
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
        >
          Product:{" "}
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>
            {editingItem?.product_name}
          </span>
        </div>

        <Input
          label="Min Stock Level"
          type="number"
          min={0}
          {...form.register("min_stock_level", { valueAsNumber: true })}
          error={form.formState.errors.min_stock_level?.message}
          helperText="Alert triggers when total quantity falls below this value."
        />

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
