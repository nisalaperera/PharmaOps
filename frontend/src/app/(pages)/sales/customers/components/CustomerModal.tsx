"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { Modal }    from "@/components/ui/Modal";
import { Button }   from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { showToast }       from "@/lib/toast";
import { apiPost, apiPatch } from "@/lib/api-client";
import { formatPhoneNumber } from "@/lib/utils";
import { customerCreateSchema, customerEditSchema, type CustomerCreateValues } from "../schemas";
import type { Customer } from "@/types";

interface CustomerModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingCustomer: Customer | null;
}

export function CustomerModal({ isOpen, onClose, editingCustomer }: CustomerModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingCustomer !== null;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CustomerCreateValues>({
    resolver:      zodResolver(isEditing ? customerEditSchema : customerCreateSchema),
    defaultValues: { credit_limit: 0 },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      reset({
        full_name:     editingCustomer.full_name,
        phone:         editingCustomer.phone,
        email:         editingCustomer.email ?? "",
        date_of_birth: editingCustomer.date_of_birth ?? "",
        address:       editingCustomer.address ?? "",
        credit_limit:  editingCustomer.credit_limit,
      });
    } else {
      reset({ full_name: "", phone: "", email: "", date_of_birth: "", address: "", credit_limit: 0 });
    }
  }, [isOpen, editingCustomer]);

  const mutation = useMutation({
    mutationFn: (values: CustomerCreateValues) => {
      const payload = {
        ...values,
        email:         values.email         || null,
        date_of_birth: values.date_of_birth || null,
        address:       values.address       || null,
      };
      return isEditing
        ? apiPatch<Customer>(`/customers/${editingCustomer!.id}`, payload)
        : apiPost<Customer>("/customers", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      showToast(
        "success",
        isEditing ? "Customer Updated" : "Customer Created",
        isEditing ? "Customer record has been updated successfully." : "Customer has been added successfully."
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Customer" : "New Customer"} size="md">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input
              label="Full Name"
              required
              placeholder="John Doe"
              error={errors.full_name?.message}
              {...register("full_name")}
            />
          </div>

          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <Input
                label="Phone"
                required
                placeholder="### ### ####"
                maxLength={12}
                error={errors.phone?.message}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
              />
            )}
          />

          <Input
            label="Email"
            type="email"
            placeholder="john@example.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Date of Birth"
            type="date"
            error={errors.date_of_birth?.message}
            {...register("date_of_birth")}
          />

          <Controller
            name="credit_limit"
            control={control}
            render={({ field }) => (
              <Input
                label="Credit Limit"
                type="number"
                min="0"
                step="0.01"
                required
                leftIcon={<DollarSign className="w-4 h-4" />}
                error={errors.credit_limit?.message}
                value={field.value ?? 0}
                onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
              />
            )}
          />

          <div className="col-span-2">
            <Textarea
              label="Address"
              placeholder="Street, City…"
              error={errors.address?.message}
              {...register("address")}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create Customer"}
          </Button>
        </div>

      </form>
    </Modal>
  );
}
