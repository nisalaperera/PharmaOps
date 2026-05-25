"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }     from "@/components/ui/Modal";
import { Button }    from "@/components/ui/Button";
import { Input }     from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { genericSchema, type GenericFormValues } from "../schemas";
import type { ProductGeneric } from "@/types";

interface GenericModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingGeneric:  ProductGeneric | null;
}

export function GenericModal({ isOpen, onClose, editingGeneric }: GenericModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingGeneric !== null;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<GenericFormValues>({
    resolver:      zodResolver(genericSchema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    if (isOpen) {
      reset(
        isEditing
          ? { name: editingGeneric.name, description: editingGeneric.description ?? "" }
          : { name: "", description: "" }
      );
    }
  }, [isOpen, isEditing, editingGeneric, reset]);

  const mutation = useMutation({
    mutationFn: (data: GenericFormValues) =>
      isEditing
        ? apiPatch<ProductGeneric>(`/products/generics/${editingGeneric!.id}`, data)
        : apiPost<ProductGeneric>("/products/generics", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generics"] });
      showToast(
        "success",
        isEditing ? "Generic Updated" : "Generic Created",
        isEditing
          ? `${editingGeneric!.name} has been updated.`
          : "New generic drug name has been added."
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Generic" : "New Generic"}
      size="md"
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
            {isEditing ? "Save Changes" : "Create Generic"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          placeholder="e.g. Paracetamol"
          required
          error={errors.name?.message}
          {...register("name")}
        />
        <div>
          <label className="form-label">Description</label>
          <textarea
            placeholder="Optional description"
            rows={3}
            className="form-input resize-none"
            {...register("description")}
          />
        </div>
      </div>
    </Modal>
  );
}
