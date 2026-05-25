"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal }        from "@/components/ui/Modal";
import { Button }       from "@/components/ui/Button";
import { Input }        from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { categorySchema, type CategoryFormValues } from "../schemas";
import type { ProductCategory } from "@/types";

interface CategoryModalProps {
  isOpen:           boolean;
  onClose:          () => void;
  editingCategory:  ProductCategory | null;
  onCreated?:       (id: string) => void;
}

export function CategoryModal({ isOpen, onClose, editingCategory, onCreated }: CategoryModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingCategory !== null;

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<CategoryFormValues>({
    resolver:      zodResolver(categorySchema),
    defaultValues: { name: "", description: "", parent_id: null },
  });

  const { data: allCategories = [] } = useQuery<ProductCategory[]>({
    queryKey: ["categories"],
    queryFn:  () => apiGet<ProductCategory[]>("/products/categories"),
    enabled:  isOpen,
  });

  // Exclude the editing category itself and show only active categories as parent options
  const parentOptions = allCategories.filter(
    (c) => c.id !== editingCategory?.id && c.is_active
  );

  useEffect(() => {
    if (isOpen) {
      reset(
        isEditing
          ? {
              name:        editingCategory.name,
              description: editingCategory.description ?? "",
              parent_id:   editingCategory.parent_id ?? null,
            }
          : { name: "", description: "", parent_id: null }
      );
    }
  }, [isOpen, isEditing, editingCategory, reset]);

  const mutation = useMutation({
    mutationFn: (data: CategoryFormValues) =>
      isEditing
        ? apiPatch<ProductCategory>(`/products/categories/${editingCategory!.id}`, data)
        : apiPost<ProductCategory>("/products/categories", data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      showToast(
        "success",
        isEditing ? "Category Updated" : "Category Created",
        isEditing
          ? `${editingCategory!.name} has been updated.`
          : "New category has been added."
      );
      if (!isEditing && onCreated) onCreated(created.id);
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
      title={isEditing ? "Edit Category" : "New Category"}
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
            {isEditing ? "Save Changes" : "Create Category"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Category Name"
          placeholder="e.g. Analgesics"
          required
          error={errors.name?.message}
          {...register("name")}
        />

        <Controller
          name="parent_id"
          control={control}
          render={({ field }) => (
            <Autocomplete
              label={
                <>
                  Parent Category{" "}
                  <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
                </>
              }
              options={[
                { value: "", label: "— Top Level (no parent) —" },
                ...parentOptions.map((c) => ({
                  value: c.id,
                  label: c.parent_name ? `${c.parent_name} › ${c.name}` : c.name,
                })),
              ]}
              value={field.value ?? ""}
              onChange={(v) => field.onChange(v || null)}
              placeholder="Search parent category…"
            />
          )}
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
