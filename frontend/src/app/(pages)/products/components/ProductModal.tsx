"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Modal }                  from "@/components/ui/Modal";
import { Button }                 from "@/components/ui/Button";
import { Input }                  from "@/components/ui/Input";
import { Autocomplete }           from "@/components/ui/Autocomplete";
import { InputWithSuggestions }   from "@/components/ui/InputWithSuggestions";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast }   from "@/lib/toast";
import { cn }          from "@/lib/utils";
import { productSchema, type ProductFormValues, type SkuMappingFormValue } from "../schemas";
import { CategoryModal } from "../categories/components/CategoryModal";
import { SkuModal }      from "../skus/components/SkuModal";
import { GenericQuickCreateModal } from "./GenericQuickCreateModal";
import { BrandQuickCreateModal }   from "./BrandQuickCreateModal";
import type { Product, ProductGeneric, ProductBrand, ProductCategory, ProductSku, PaginatedResponse } from "@/types";

interface ProductModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingProduct:  Product | null;
  cloningProduct?: Product | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ActiveToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors select-none",
        value
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", value ? "bg-emerald-500" : "bg-slate-400")} />
      {value ? "Active" : "Inactive"}
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        {title}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

function computeBasicCounts(
  mappings: { sku: string; mapped_sku: string; mapped_sku_count: number }[]
): number[] {
  const counts: number[] = new Array(mappings.length).fill(0);
  mappings.forEach((row, i) => {
    if (row.mapped_sku === "basic") counts[i] = row.mapped_sku_count || 0;
  });
  for (let pass = 0; pass < mappings.length; pass++) {
    mappings.forEach((row, i) => {
      if (row.mapped_sku !== "basic" && counts[i] === 0) {
        const targetIdx = mappings.findIndex((r) => r.sku === row.mapped_sku);
        if (targetIdx >= 0 && counts[targetIdx] > 0) {
          counts[i] = (row.mapped_sku_count || 0) * counts[targetIdx];
        }
      }
    });
  }
  return counts;
}

// ─── ProductModal ─────────────────────────────────────────────────────────────

export function ProductModal({ isOpen, onClose, editingProduct, cloningProduct = null }: ProductModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingProduct !== null;
  const isCloning   = !isEditing && cloningProduct !== null;

  const [genericModalOpen,   setGenericModalOpen]   = useState(false);
  const [brandModalOpen,     setBrandModalOpen]     = useState(false);
  const [categoryModalOpen,  setCategoryModalOpen]  = useState(false);
  const [basicSkuModalOpen,  setBasicSkuModalOpen]  = useState(false);
  const [newGenericName,     setNewGenericName]     = useState("");
  const [newBrandName,       setNewBrandName]       = useState("");

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver:      zodResolver(productSchema),
    defaultValues: {
      name: "", generic_id: "", brand_id: "", category_id: "", basic_sku_id: "",
      barcode: "", specific_instructions: "", sku_mappings: [], is_active: true,
    },
  });

  const watchedIsActive   = useWatch({ control, name: "is_active" });
  const watchedName       = useWatch({ control, name: "name" }) ?? "";
  const watchedBasicSkuId = useWatch({ control, name: "basic_sku_id" });
  const watchedMappings   = useWatch({ control, name: "sku_mappings" }) ?? [];

  const { fields: mappingFields, append: appendMapping, remove: removeMapping } = useFieldArray({
    control,
    name: "sku_mappings",
  });

  // ─── Sub-catalog queries ────────────────────────────────────────────────────

  const { data: generics   = [] } = useQuery<ProductGeneric[]>({
    queryKey: ["generics"],
    queryFn:  () => apiGet<ProductGeneric[]>("/products/generics"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: brands     = [] } = useQuery<ProductBrand[]>({
    queryKey: ["brands"],
    queryFn:  () => apiGet<ProductBrand[]>("/products/brands"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ["categories"],
    queryFn:  () => apiGet<ProductCategory[]>("/products/categories"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: skus       = [] } = useQuery<ProductSku[]>({
    queryKey: ["skus"],
    queryFn:  () => apiGet<ProductSku[]>("/products/skus"),
    staleTime: 5 * 60 * 1000,
  });

  const selectedSku = skus.find((s) => s.id === watchedBasicSkuId);

  // ─── Product name suggestions (triggered after 3 chars) ─────────────────────

  const { data: suggestionsData } = useQuery<PaginatedResponse<Product>>({
    queryKey: ["product-name-suggestions", watchedName],
    queryFn:  () => apiGet<PaginatedResponse<Product>>("/products", { search: watchedName, page_size: 8, sort_by: "name" }),
    enabled:  watchedName.trim().length >= 3,
    staleTime: 30 * 1000,
  });

  const nameSuggestions = (suggestionsData?.data ?? [])
    .map((p) => p.name)
    .filter((n) => n.toLowerCase() !== watchedName.toLowerCase() && n !== editingProduct?.name);

  // ─── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        reset({
          name:                  editingProduct.name,
          generic_id:            editingProduct.generic_id,
          brand_id:              editingProduct.brand_id,
          category_id:           editingProduct.category_id,
          basic_sku_id:          editingProduct.basic_sku_id,
          barcode:               editingProduct.barcode ?? "",
          specific_instructions: editingProduct.specific_instructions ?? "",
          sku_mappings:          editingProduct.sku_mappings,
          is_active:             editingProduct.is_active,
        });
      } else if (isCloning && cloningProduct) {
        reset({
          name:                  cloningProduct.name,
          generic_id:            cloningProduct.generic_id,
          brand_id:              cloningProduct.brand_id,
          category_id:           cloningProduct.category_id,
          basic_sku_id:          cloningProduct.basic_sku_id,
          barcode:               "",
          specific_instructions: cloningProduct.specific_instructions ?? "",
          sku_mappings:          cloningProduct.sku_mappings,
          is_active:             true,
        });
      } else {
        reset({
          name: "", generic_id: "", brand_id: "", category_id: "", basic_sku_id: "",
          barcode: "", specific_instructions: "", sku_mappings: [], is_active: true,
        });
      }
    }
  }, [isOpen, isEditing, isCloning, editingProduct, cloningProduct, reset]);

  // ─── Mutation ───────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (data: ProductFormValues) => {
      const computedCounts = computeBasicCounts(data.sku_mappings);
      const sku_mappings   = data.sku_mappings.map((row, i) => ({
        ...row,
        basic_sku_count: computedCounts[i],
      }));
      const payload = {
        ...data,
        sku_mappings,
        barcode:               data.barcode || undefined,
        specific_instructions: data.specific_instructions || undefined,
      };
      return isEditing
        ? apiPatch<Product>(`/products/${editingProduct!.id}`, payload)
        : apiPost<Product>("/products", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      showToast(
        "success",
        isEditing ? "Product Updated" : "Product Created",
        isEditing
          ? `${editingProduct!.name} has been updated.`
          : "New product has been added to the catalog."
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  // ─── Computed basic SKU counts for display ──────────────────────────────────

  const computedCounts = computeBasicCounts(watchedMappings as SkuMappingFormValue[]);

  const headerExtra = (
    <ActiveToggle
      value={watchedIsActive ?? true}
      onChange={(v) => setValue("is_active", v, { shouldDirty: true })}
    />
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? "Edit Product" : isCloning ? "Clone Product" : "New Product"}
        size="xl"
        headerExtra={headerExtra}
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
              {isEditing ? "Save Changes" : isCloning ? "Clone Product" : "Create Product"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">

          {/* Basic info */}
          <SectionHeader title="Basic Information" />

          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <InputWithSuggestions
                label="Product Name"
                placeholder="e.g. Panadol 500mg Tablets"
                required
                value={field.value}
                onChange={field.onChange}
                suggestions={nameSuggestions}
                error={errors.name?.message}
              />
            )}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Generic */}
            <Controller
              name="generic_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  label="Generic"
                  required
                  options={generics.map((g) => ({ value: g.id, label: g.name }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Search generic…"
                  onCreateNew={(name) => { setNewGenericName(name); setGenericModalOpen(true); }}
                  error={errors.generic_id?.message}
                />
              )}
            />

            {/* Brand */}
            <Controller
              name="brand_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  label="Brand"
                  required
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Search brand…"
                  onCreateNew={(name) => { setNewBrandName(name); setBrandModalOpen(true); }}
                  error={errors.brand_id?.message}
                />
              )}
            />

            {/* Category */}
            <Controller
              name="category_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  label="Category"
                  required
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.parent_name ? `${c.parent_name} › ${c.name}` : c.name,
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Search category…"
                  onCreateNew={() => setCategoryModalOpen(true)}
                  error={errors.category_id?.message}
                />
              )}
            />

            {/* Basic SKU */}
            <Controller
              name="basic_sku_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  label="Basic SKU"
                  required
                  options={skus.map((s) => ({ value: s.id, label: s.name }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Search SKU…"
                  onCreateNew={() => setBasicSkuModalOpen(true)}
                  error={errors.basic_sku_id?.message}
                />
              )}
            />
          </div>

          {/* Barcode */}
          <SectionHeader title="Identification" />

          <Input
            label="Barcode"
            placeholder="e.g. 9780201379624"
            error={errors.barcode?.message}
            {...register("barcode")}
          />

          {/* Specific Instructions */}
          <SectionHeader title="Additional Information" />

          <div>
            <label className="form-label">Specific Instructions</label>
            <textarea
              placeholder="e.g. Take with food, Store below 25°C"
              rows={3}
              className="form-input resize-none"
              {...register("specific_instructions")}
            />
          </div>

          {/* Other SKU Mappings */}
          <SectionHeader title="Other SKU Mappings" />

          <div className="space-y-3">
            {mappingFields.length > 0 && (
              <div
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* Header row */}
                <div
                  className="grid gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                  style={{
                    background: "var(--color-table-header)",
                    color: "var(--color-text-muted)",
                    gridTemplateColumns: "1fr 1fr 80px 80px 32px",
                  }}
                >
                  <span>SKU</span>
                  <span>Mapped To</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Basic Count</span>
                  <span />
                </div>

                {mappingFields.map((field, index) => {
                  const otherRows = (watchedMappings as SkuMappingFormValue[])
                    .filter((_, i) => i !== index && (watchedMappings[i] as SkuMappingFormValue).sku);

                  const mappedToOptions = [
                    {
                      value: "basic",
                      label: selectedSku
                        ? `${selectedSku.name} (Basic)`
                        : "Basic SKU",
                    },
                    ...otherRows.map((r) => ({
                      value: r.sku,
                      label: r.sku,
                    })),
                  ];

                  return (
                    <div
                      key={field.id}
                      className="grid gap-2 px-3 py-2 items-center border-t"
                      style={{
                        borderColor: "var(--color-border)",
                        gridTemplateColumns: "1fr 1fr 80px 80px 32px",
                      }}
                    >
                      {/* SKU — select from skus */}
                      <select
                        className="form-select text-sm"
                        {...register(`sku_mappings.${index}.sku`)}
                      >
                        <option value="">Select SKU…</option>
                        {skus.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      {/* Mapped to */}
                      <select
                        className="form-select text-sm"
                        {...register(`sku_mappings.${index}.mapped_sku`)}
                      >
                        {mappedToOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>

                      {/* Qty */}
                      <Controller
                        name={`sku_mappings.${index}.mapped_sku_count`}
                        control={control}
                        render={({ field: f }) => (
                          <input
                            type="number"
                            min={1}
                            className="form-input text-sm text-right"
                            value={f.value || ""}
                            onChange={(e) => f.onChange(parseInt(e.target.value, 10) || 0)}
                          />
                        )}
                      />

                      {/* Basic count (read-only) */}
                      <div
                        className="text-sm text-right font-mono px-2 py-1.5 rounded"
                        style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
                      >
                        {computedCounts[index] || "—"}
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeMapping(index)}
                        className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() =>
                appendMapping({ sku: "", mapped_sku: "basic", mapped_sku_count: 1, basic_sku_count: 0 })
              }
            >
              Add Mapping
            </Button>
          </div>

        </div>
      </Modal>

      {/* Quick-create modals */}
      <GenericQuickCreateModal
        isOpen={genericModalOpen}
        onClose={() => setGenericModalOpen(false)}
        initialName={newGenericName}
        onCreated={(id) => setValue("generic_id", id, { shouldDirty: true })}
      />

      <BrandQuickCreateModal
        isOpen={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        initialName={newBrandName}
        onCreated={(id) => setValue("brand_id", id, { shouldDirty: true })}
      />

      <CategoryModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        editingCategory={null}
        onCreated={(id) => setValue("category_id", id, { shouldDirty: true })}
      />

      <SkuModal
        isOpen={basicSkuModalOpen}
        onClose={() => setBasicSkuModalOpen(false)}
        editingSku={null}
        onCreated={(id) => setValue("basic_sku_id", id, { shouldDirty: true })}
      />
    </>
  );
}
