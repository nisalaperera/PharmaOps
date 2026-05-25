"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input }  from "@/components/ui/Input";
import { apiPost, apiPatch } from "@/lib/api-client";
import { formatPhoneNumber } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import {
  doctorCreateSchema,
  doctorEditSchema,
  type DoctorCreateValues,
  type DoctorEditValues,
} from "../schemas";
import type { Doctor } from "@/types";

interface DoctorModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  editingDoctor: Doctor | null;
}

export function DoctorModal({ isOpen, onClose, editingDoctor }: DoctorModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingDoctor !== null;

  const form = useForm<DoctorCreateValues>({
    resolver:      zodResolver(isEditing ? doctorEditSchema : doctorCreateSchema),
    defaultValues: { name: "", specialization: "", hospital_or_clinic: "", license_number: "", phone: "" },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingDoctor) {
      form.reset({
        name:               editingDoctor.name,
        specialization:     editingDoctor.specialization,
        hospital_or_clinic: editingDoctor.hospital_or_clinic,
        license_number:     editingDoctor.license_number,
        phone:              editingDoctor.phone,
      });
    } else {
      form.reset({ name: "", specialization: "", hospital_or_clinic: "", license_number: "", phone: "" });
    }
  }, [isOpen, editingDoctor]);

  const createMutation = useMutation({
    mutationFn: (values: DoctorCreateValues) => apiPost<Doctor>("/doctors", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      showToast("success", "Doctor Added", "The doctor has been registered successfully.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  const editMutation = useMutation({
    mutationFn: (values: DoctorEditValues) => apiPatch<Doctor>(`/doctors/${editingDoctor!.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      showToast("success", "Doctor Updated", "The doctor record has been updated successfully.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong.");
    },
  });

  const isPending = createMutation.isPending || editMutation.isPending;
  const errors    = form.formState.errors;

  function onSubmit(values: DoctorCreateValues) {
    if (isEditing) editMutation.mutate(values);
    else           createMutation.mutate(values);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Doctor" : "Add Doctor"} size="md">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input {...form.register("name")} label="Full Name" placeholder="Dr. Jane Smith" required error={errors.name?.message} />
          <Input {...form.register("specialization")} label="Specialization" placeholder="e.g. Cardiology" required error={errors.specialization?.message} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input {...form.register("hospital_or_clinic")} label="Hospital / Clinic" placeholder="e.g. City General Hospital" required error={errors.hospital_or_clinic?.message} />
          <Input {...form.register("license_number")} label="License Number" placeholder="e.g. SLMC-12345" required error={errors.license_number?.message} />
        </div>
        <Controller
          name="phone"
          control={form.control}
          render={({ field }) => (
            <Input
              label="Phone"
              placeholder="077 123 4567"
              required
              error={errors.phone?.message}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
              onBlur={field.onBlur}
              maxLength={12}
            />
          )}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={isPending}>
            {isEditing ? "Save Changes" : "Add Doctor"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
