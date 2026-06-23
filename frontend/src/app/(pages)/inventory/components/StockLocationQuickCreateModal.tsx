"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { apiPost } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { useBranch } from "@/hooks/useBranch";
import type { StockLocation } from "@/types";

const quickCreateSchema = z.object({
  name:        z.string().min(1, "Name is required"),
  code:        z.string().min(1, "Code is required").max(20),
  description: z.string().optional(),
});

type QuickCreateValues = z.infer<typeof quickCreateSchema>;

function nameToCode(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 20);
}

interface StockLocationQuickCreateModalProps {
  isOpen:       boolean;
  onClose:      () => void;
  onCreated:    (id: string) => void;
  defaultName?: string;
  defaultCode?: string;
}

export function StockLocationQuickCreateModal({ isOpen, onClose, onCreated, defaultName, defaultCode }: StockLocationQuickCreateModalProps) {
  const queryClient        = useQueryClient();
  const { activeBranchId } = useBranch();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<QuickCreateValues>({
    resolver:      zodResolver(quickCreateSchema),
    defaultValues: { name: "", code: "", description: "" },
  });

  useEffect(() => {
    if (isOpen) {
      const name = defaultName ?? "";
      const code = defaultCode ?? (name ? nameToCode(name) : "");
      reset({ name, code, description: "" });
    }
  }, [isOpen, defaultName, defaultCode, reset]);

  const mutation = useMutation({
    mutationFn: (data: QuickCreateValues) =>
      apiPost<StockLocation>("/stock-locations", { ...data, branch_id: activeBranchId }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
      showToast("success", "Location Created", `${created.name} has been created.`);
      onCreated(created.id);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Stock Location"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit((d) => mutation.mutate(d))} isLoading={mutation.isPending}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Name" placeholder="e.g. EXP-Panadol-2025" required
          {...register("name")} error={errors.name?.message} />
        <Input label="Code" placeholder="e.g. EXP-PAN-25" required maxLength={20}
          {...register("code")} error={errors.code?.message} />
        <Input label="Description" placeholder="Optional"
          {...register("description")} />
      </div>
    </Modal>
  );
}
