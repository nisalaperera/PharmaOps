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
import { PHARMA_COUNTRY_OPTIONS } from "@/lib/constants";
import { brandSchema, type BrandFormValues } from "../schemas";
import type { ProductBrand } from "@/types";

interface BrandModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  editingBrand:  ProductBrand | null;
}

export function BrandModal({ isOpen, onClose, editingBrand }: BrandModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingBrand !== null;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<BrandFormValues>({
    resolver:      zodResolver(brandSchema),
    defaultValues: { name: "", manufacturer_name: "", country: "", return_expiry_before: undefined },
  });

  useEffect(() => {
    if (isOpen) {
      reset(
        isEditing
          ? {
              name:                 editingBrand.name,
              manufacturer_name:    editingBrand.manufacturer_name ?? "",
              country:              editingBrand.country ?? "",
              return_expiry_before: editingBrand.return_expiry_before ?? undefined,
            }
          : { name: "", manufacturer_name: "", country: "", return_expiry_before: undefined }
      );
    }
  }, [isOpen, isEditing, editingBrand, reset]);

  const mutation = useMutation({
    mutationFn: (data: BrandFormValues) =>
      isEditing
        ? apiPatch<ProductBrand>(`/products/brands/${editingBrand!.id}`, data)
        : apiPost<ProductBrand>("/products/brands", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      showToast(
        "success",
        isEditing ? "Brand Updated" : "Brand Created",
        isEditing
          ? `${editingBrand!.name} has been updated.`
          : "New brand has been added."
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
      title={isEditing ? "Edit Brand" : "New Brand"}
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
            {isEditing ? "Save Changes" : "Create Brand"}
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
        <Input
          label="Manufacturer Name"
          placeholder="e.g. GSK Consumer Healthcare"
          error={errors.manufacturer_name?.message}
          {...register("manufacturer_name")}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Country</label>
            <select {...register("country")} className="form-select w-full">
              <option value="">Select country...</option>
              {PHARMA_COUNTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Return Expiry Before (days)"
            type="number"
            placeholder="e.g. 60"
            helperText="Days before expiry for return policy"
            {...register("return_expiry_before")}
            error={errors.return_expiry_before?.message}
          />
        </div>
      </div>
    </Modal>
  );
}
