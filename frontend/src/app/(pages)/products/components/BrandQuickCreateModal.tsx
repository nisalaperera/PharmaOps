"use client";

import { useEffect } from "react";
import { useForm }   from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z }         from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }     from "@/components/ui/Modal";
import { Button }    from "@/components/ui/Button";
import { Input }     from "@/components/ui/Input";
import { apiPost }   from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import type { ProductBrand } from "@/types";

const schema = z.object({
  name:        z.string().min(1, "Name is required").max(200),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface BrandQuickCreateModalProps {
  isOpen:       boolean;
  onClose:      () => void;
  initialName?: string;
  onCreated:    (id: string) => void;
}

export function BrandQuickCreateModal({
  isOpen, onClose, initialName = "", onCreated,
}: BrandQuickCreateModalProps) {
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver:      zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    if (isOpen) reset({ name: initialName, description: "" });
  }, [isOpen, initialName, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormValues) => apiPost<ProductBrand>("/products/brands", data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      showToast("success", "Brand Created", `${created.name} has been added.`);
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
      title="New Brand"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit((data) => mutation.mutate(data))}
            isLoading={mutation.isPending}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Brand Name"
          placeholder="e.g. Panadol"
          required
          error={errors.name?.message}
          {...register("name")}
        />
        <div>
          <label className="form-label">Description</label>
          <textarea
            placeholder="Optional description"
            rows={2}
            className="form-input resize-none"
            {...register("description")}
          />
        </div>
      </div>
    </Modal>
  );
}
