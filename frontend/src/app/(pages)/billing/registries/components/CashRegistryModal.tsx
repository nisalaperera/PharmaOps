"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }    from "@/components/ui/Modal";
import { Button }   from "@/components/ui/Button";
import { Input }    from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  cashRegistryCreateSchema,
  cashRegistryEditSchema,
  type CashRegistryCreateValues,
  type CashRegistryEditValues,
} from "@/app/(pages)/billing/registries/schemas";
import type { CashRegistry, Branch, Staff, PaginatedResponse } from "@/types";

interface CashRegistryModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingRegistry: CashRegistry | null;
}

export function CashRegistryModal({ isOpen, onClose, editingRegistry }: CashRegistryModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingRegistry !== null;

  // Tracks the branch selected in the form so we can filter staff
  const [selectedBranchId, setSelectedBranchId] = useState("");

  // ─── Branches dropdown ────────────────────────────────────────────────────────

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const allBranches = branchesData?.data ?? [];

  // ─── Staff dropdown (filtered by branch) ─────────────────────────────────────

  const { data: staffData } = useQuery<PaginatedResponse<Staff>>({
    queryKey:  ["staff-by-branch", selectedBranchId],
    queryFn:   () =>
      apiGet<PaginatedResponse<Staff>>("/staff", {
        branch_id: selectedBranchId,
        is_active: "true",
        page_size: 200,
      }),
    enabled:   selectedBranchId !== "",
    staleTime: 2 * 60 * 1000,
  });
  const branchStaff = staffData?.data ?? [];

  // ─── Forms ────────────────────────────────────────────────────────────────────

  const createForm = useForm<CashRegistryCreateValues>({
    resolver:      zodResolver(cashRegistryCreateSchema),
    defaultValues: {
      name:                 "",
      branch_id:            "",
      responsible_staff_id: "",
    },
  });

  const editForm = useForm<CashRegistryEditValues>({
    resolver:      zodResolver(cashRegistryEditSchema),
    defaultValues: {
      name:                 "",
      branch_id:            "",
      responsible_staff_id: "",
    },
  });

  // ─── Reset on open ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      editForm.reset({
        name:                 editingRegistry.name,
        branch_id:            editingRegistry.branch_id,
        responsible_staff_id: editingRegistry.responsible_staff_id ?? "",
      });
      setSelectedBranchId(editingRegistry.branch_id);
    } else {
      createForm.reset({
        name:                 "",
        branch_id:            "",
        responsible_staff_id: "",
      });
      setSelectedBranchId("");
    }
  }, [isOpen, isEditing, editingRegistry]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Mutations ────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (values: CashRegistryCreateValues) =>
      apiPost<CashRegistry>("/treasury/registries", values),
    onSuccess: (registry) => {
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      showToast("success", "Registry Created", `${registry.name} has been added.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const editMutation = useMutation({
    mutationFn: (values: CashRegistryEditValues) =>
      apiPatch<CashRegistry>(`/treasury/registries/${editingRegistry!.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      showToast("success", "Registry Updated", `${editingRegistry!.name} has been updated.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const isPending = createMutation.isPending || editMutation.isPending;

  function handleSubmit() {
    if (isEditing) {
      editForm.handleSubmit((values) => editMutation.mutate(values))();
    } else {
      createForm.handleSubmit((values) => createMutation.mutate(values))();
    }
  }

  // ─── Shared staff select rendered inside the active form's context ─────────────

  function StaffSelect({ register }: { register: ReturnType<typeof createForm.register> | ReturnType<typeof editForm.register> }) {
    return (
      <div>
        <label className="form-label">Responsible Staff</label>
        <select
          className="form-select"
          disabled={selectedBranchId === ""}
          {...register}
        >
          <option value="">No staff assigned</option>
          {branchStaff.map((staffMember) => (
            <option key={staffMember.id} value={staffMember.id}>
              {[staffMember.title, staffMember.first_name, staffMember.last_name]
                .filter(Boolean)
                .join(" ")}
            </option>
          ))}
        </select>
        {selectedBranchId === "" && (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            Select a branch first to choose staff.
          </p>
        )}
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Registry" : "New Cash Registry"}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isPending}>
            {isEditing ? "Save Changes" : "Create Registry"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {isEditing ? (
          <>
            {/* Name */}
            <Input
              label="Name"
              placeholder="e.g. Main Counter"
              required
              error={editForm.formState.errors.name?.message}
              {...editForm.register("name")}
            />

            {/* Branch */}
            <div>
              <label className="form-label">
                Branch <span className="text-danger-500">*</span>
              </label>
              <Controller
                name="branch_id"
                control={editForm.control}
                render={({ field }) => (
                  <select
                    className={cn(
                      "form-select",
                      editForm.formState.errors.branch_id && "border-danger-500"
                    )}
                    value={field.value ?? ""}
                    onBlur={field.onBlur}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      editForm.setValue("responsible_staff_id", "");
                      setSelectedBranchId(e.target.value);
                    }}
                  >
                    <option value="">Select branch…</option>
                    {allBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                )}
              />
              {editForm.formState.errors.branch_id && (
                <p className="form-error">{editForm.formState.errors.branch_id.message}</p>
              )}
            </div>

            {/* Responsible Staff */}
            <StaffSelect register={editForm.register("responsible_staff_id")} />
          </>
        ) : (
          <>
            {/* Name */}
            <Input
              label="Name"
              placeholder="e.g. Main Counter"
              required
              error={createForm.formState.errors.name?.message}
              {...createForm.register("name")}
            />

            {/* Branch */}
            <div>
              <label className="form-label">
                Branch <span className="text-danger-500">*</span>
              </label>
              <Controller
                name="branch_id"
                control={createForm.control}
                render={({ field }) => (
                  <select
                    className={cn(
                      "form-select",
                      createForm.formState.errors.branch_id && "border-danger-500"
                    )}
                    value={field.value ?? ""}
                    onBlur={field.onBlur}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      createForm.setValue("responsible_staff_id", "");
                      setSelectedBranchId(e.target.value);
                    }}
                  >
                    <option value="">Select branch…</option>
                    {allBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                )}
              />
              {createForm.formState.errors.branch_id && (
                <p className="form-error">{createForm.formState.errors.branch_id.message}</p>
              )}
            </div>

            {/* Responsible Staff */}
            <StaffSelect register={createForm.register("responsible_staff_id")} />
          </>
        )}

      </div>
    </Modal>
  );
}
