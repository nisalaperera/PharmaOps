"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { Modal }          from "@/components/ui/Modal";
import { Button }         from "@/components/ui/Button";
import { Input }          from "@/components/ui/Input";
import { FormattedInput } from "@/components/ui/FormattedInput";
import { Autocomplete }   from "@/components/ui/Autocomplete";
import { apiGet, apiPost, apiPatch, apiClient } from "@/lib/api-client";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [iconPreview, setIconPreview] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const { register, handleSubmit, reset, control, setValue, watch, formState: { errors } } = useForm<CategoryFormValues>({
    resolver:      zodResolver(categorySchema),
    defaultValues: { name: "", parent_id: null, is_discount_applicable: false, icon: "", colour: "" },
  });

  const watchedIcon = watch("icon");

  const { data: allCategories = [] } = useQuery<ProductCategory[]>({
    queryKey: ["categories"],
    queryFn:  () => apiGet<ProductCategory[]>("/products/categories"),
    enabled:  isOpen,
  });

  const parentOptions = allCategories.filter(
    (c) => c.id !== editingCategory?.id && c.is_active
  );

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        reset({
          name:                       editingCategory.name,
          parent_id:                  editingCategory.parent_id ?? null,
          is_discount_applicable:     editingCategory.is_discount_applicable ?? false,
          default_margin_percentage:  editingCategory.default_margin_percentage ?? null,
          icon:                       editingCategory.icon ?? "",
          colour:                     editingCategory.colour ?? "",
        });
        setIconPreview(editingCategory.icon ?? "");
      } else {
        reset({ name: "", parent_id: null, is_discount_applicable: false, default_margin_percentage: null, icon: "", colour: "" });
        setIconPreview("");
      }
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
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit((data) => mutation.mutate(data))} isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create Category"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Category Name" placeholder="e.g. Analgesics" required
          error={errors.name?.message} {...register("name")} />

        <Controller
          name="parent_id"
          control={control}
          render={({ field }) => (
            <Autocomplete
              label={
                <>Parent Category{" "}<span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span></>
              }
              options={parentOptions.map((c) => ({
                value: c.id,
                label: c.parent_name ? `${c.parent_name} > ${c.name}` : c.name,
              }))}
              value={field.value ?? ""}
              onChange={(v) => field.onChange(v || null)}
              placeholder="Search parent category..."
            />
          )}
        />

        <Controller
          name="default_margin_percentage"
          control={control}
          render={({ field }) => {
            const selectedParentId = watch("parent_id");
            const parentCategory = allCategories.find((c) => c.id === selectedParentId);
            const inheritedMargin = parentCategory?.effective_margin_percentage;
            return (
              <FormattedInput
                label="Default Margin %"
                format="percentage"
                value={field.value ?? 0}
                onChange={(v) => field.onChange(v === 0 ? null : v)}
                min={0}
                max={999}
                placeholder={inheritedMargin != null ? `Inherited: ${inheritedMargin}%` : "e.g. 20"}
                helperText={
                  field.value == null && inheritedMargin != null
                    ? `Inherits ${inheritedMargin}% from parent category`
                    : undefined
                }
              />
            );
          }}
        />

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register("is_discount_applicable")}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
            <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Discount Applicable</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Icon</label>
            <div className="flex items-center gap-3">
              {(iconPreview || watchedIcon) && (
                <div className="relative w-10 h-10 rounded-lg border overflow-hidden flex-shrink-0"
                  style={{ borderColor: "var(--color-border)" }}>
                  <img src={iconPreview || watchedIcon || undefined} alt="Icon" className="w-full h-full object-cover" />
                  <button type="button"
                    onClick={() => { setValue("icon", "", { shouldDirty: true }); setIconPreview(""); }}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger-500 text-white flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              <button type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
                <Upload className="w-3.5 h-3.5" />
                {isUploading ? "Uploading..." : "Upload Icon"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
                className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploading(true);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await apiClient.post<{ url: string }>("/uploads/image", formData, {
                      headers: { "Content-Type": undefined },
                    });
                    setValue("icon", res.data.url, { shouldDirty: true });
                    setIconPreview(res.data.url);
                  } catch {
                    showToast("error", "Upload Failed", "Could not upload icon image.");
                  } finally {
                    setIsUploading(false);
                    e.target.value = "";
                  }
                }} />
            </div>
          </div>
          <Controller
            name="colour"
            control={control}
            render={({ field }) => (
              <div>
                <label className="form-label">Colour</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={field.value || "#000000"}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer flex-shrink-0"
                    style={{ borderColor: "var(--color-border)" }} />
                  <input type="text" value={field.value || ""} placeholder="#000000"
                    onChange={(e) => field.onChange(e.target.value)}
                    className="form-input flex-1 text-xs font-mono" />
                </div>
              </div>
            )}
          />
        </div>
      </div>
    </Modal>
  );
}
