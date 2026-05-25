"use client";

import { useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { formatPhoneNumber, getStaffDisplayName, cn } from "@/lib/utils";
import { STAFF_TITLE_OPTIONS, STAFF_POSITION_OPTIONS } from "@/lib/constants";
import {
  staffCreateSchema,
  staffEditSchema,
  type StaffCreateValues,
  type StaffEditValues,
} from "@/app/(pages)/staff/schemas";
import { useAuth } from "@/hooks/useAuth";
import { showToast } from "@/lib/toast";
import type { Staff, Branch, PaginatedResponse } from "@/types";

interface StaffModalProps {
  isOpen:       boolean;
  onClose:      () => void;
  editingStaff: Staff | null;
}

// ─── Status toggle ────────────────────────────────────────────────────────────

function StatusToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
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

// ─── Reusable phone Controller ────────────────────────────────────────────────

function PhoneField({
  name, label, required, control, error,
}: {
  name:     string;
  label:    string;
  required?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control:  any;
  error?:   string;
}) {
  return (
    <Controller
      name={name as never}
      control={control}
      render={({ field }) => (
        <Input
          label={label}
          placeholder="077 123 4567"
          required={required}
          error={error}
          value={field.value ?? ""}
          onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
          onBlur={field.onBlur}
          maxLength={12}
        />
      )}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StaffModal({ isOpen, onClose, editingStaff }: StaffModalProps) {
  const queryClient  = useQueryClient();
  const { user: me, permissions } = useAuth();
  const isEditing    = editingStaff !== null;

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled:   permissions?.isOrgLevel ?? false,
  });
  const branches = branchesData?.data ?? [];

  const createForm = useForm<StaffCreateValues>({
    resolver:      zodResolver(staffCreateSchema),
    defaultValues: {
      branch_id:       me?.branchId ?? "",
      title:           "",
      first_name:      "",
      last_name:       "",
      mobile_1:        "",
      mobile_2:        "",
      landline:        "",
      whatsapp_number: "",
      email:           "",
      epf_no:          "",
      id_number:       "",
      address:         "",
      role:            "",
      is_active:       true,
    },
  });

  const editForm = useForm<StaffEditValues>({
    resolver:      zodResolver(staffEditSchema),
    defaultValues: {
      title:           "",
      first_name:      "",
      last_name:       "",
      mobile_1:        "",
      mobile_2:        "",
      landline:        "",
      whatsapp_number: "",
      email:           "",
      epf_no:          "",
      id_number:       "",
      address:         "",
      role:            "",
      is_active:       true,
    },
  });

  const watchedIsActive = useWatch({ control: editForm.control, name: "is_active" });

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      editForm.reset({
        title:           editingStaff.title           ?? "",
        first_name:      editingStaff.first_name,
        last_name:       editingStaff.last_name,
        mobile_1:        editingStaff.mobile_1        ?? "",
        mobile_2:        editingStaff.mobile_2        ?? "",
        landline:        editingStaff.landline        ?? "",
        whatsapp_number: editingStaff.whatsapp_number ?? "",
        email:           editingStaff.email           ?? "",
        epf_no:          editingStaff.epf_no          ?? "",
        id_number:       editingStaff.id_number       ?? "",
        address:         editingStaff.address         ?? "",
        role:            editingStaff.role,
        is_active:       editingStaff.is_active,
      });
    } else {
      createForm.reset({
        branch_id:       me?.branchId ?? "",
        title:           "",
        first_name:      "",
        last_name:       "",
        mobile_1:        "",
        mobile_2:        "",
        landline:        "",
        whatsapp_number: "",
        email:           "",
        epf_no:          "",
        id_number:       "",
        address:         "",
        role:            "",
        is_active:       true,
      });
    }
  }, [isOpen, isEditing, editingStaff, createForm, editForm, me?.branchId]);

  const createMutation = useMutation({
    mutationFn: (data: StaffCreateValues) => apiPost<Staff>("/staff", data),
    onSuccess: (staff) => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      showToast("success", "Staff Member Added", `${getStaffDisplayName(staff)} has been added to the team.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: StaffEditValues) =>
      apiPatch<Staff>(`/staff/${editingStaff!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      showToast("success", "Staff Member Updated", `${getStaffDisplayName(editingStaff!)}'s details have been saved.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const isPending = createMutation.isPending || editMutation.isPending;

  function handleSubmit() {
    if (isEditing) {
      editForm.handleSubmit((data) => editMutation.mutate(data))();
    } else {
      createForm.handleSubmit((data) => createMutation.mutate(data))();
    }
  }

  const activeControl = isEditing ? editForm.control : createForm.control;
  const activeErrors  = isEditing ? editForm.formState.errors : createForm.formState.errors;

  const headerExtra = isEditing ? (
    <StatusToggle
      value={watchedIsActive}
      onChange={(v) => editForm.setValue("is_active", v, { shouldDirty: true })}
    />
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Staff Member" : "New Staff Member"}
      size="lg"
      headerExtra={headerExtra}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isPending}>
            {isEditing ? "Save Changes" : "Add Staff Member"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Branch — create only, org-level users */}
        {!isEditing && permissions?.isOrgLevel && (
          <div>
            <label className="form-label">
              Branch <span className="text-danger-500">*</span>
            </label>
            <select
              className={cn(
                "form-select",
                createForm.formState.errors.branch_id && "border-danger-500"
              )}
              {...createForm.register("branch_id")}
            >
              <option value="">Select branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {createForm.formState.errors.branch_id && (
              <p className="form-error">{createForm.formState.errors.branch_id.message}</p>
            )}
          </div>
        )}

        {/* Title | First Name | Last Name */}
        <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_1fr] gap-4">
          <div>
            <label className="form-label">Title</label>
            <select className="form-select" {...(isEditing ? editForm.register("title") : createForm.register("title"))}>
              {STAFF_TITLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="First Name"
            placeholder="e.g. Kamal"
            required
            error={activeErrors.first_name?.message}
            {...(isEditing ? editForm.register("first_name") : createForm.register("first_name"))}
          />
          <Input
            label="Last Name"
            placeholder="e.g. Perera"
            required
            error={activeErrors.last_name?.message}
            {...(isEditing ? editForm.register("last_name") : createForm.register("last_name"))}
          />
        </div>

        {/* Job Title */}
        <div>
          <label className="form-label">
            Job Title <span className="text-danger-500">*</span>
          </label>
          <input
            list="staff-positions"
            className={cn("form-input", activeErrors.role && "border-danger-500")}
            placeholder="e.g. Pharmacist"
            {...(isEditing ? editForm.register("role") : createForm.register("role"))}
          />
          <datalist id="staff-positions">
            {STAFF_POSITION_OPTIONS.map((pos) => (
              <option key={pos} value={pos} />
            ))}
          </datalist>
          {activeErrors.role && (
            <p className="form-error">{activeErrors.role.message}</p>
          )}
        </div>

        {/* Mobile 1 | Mobile 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PhoneField
            name="mobile_1"
            label="Mobile 1"
            required
            control={activeControl}
            error={(activeErrors as Record<string, { message?: string }>).mobile_1?.message}
          />
          <PhoneField
            name="mobile_2"
            label="Mobile 2"
            control={activeControl}
            error={(activeErrors as Record<string, { message?: string }>).mobile_2?.message}
          />
        </div>

        {/* Landline | WhatsApp */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PhoneField
            name="landline"
            label="Landline"
            control={activeControl}
            error={(activeErrors as Record<string, { message?: string }>).landline?.message}
          />
          <PhoneField
            name="whatsapp_number"
            label="WhatsApp Number"
            control={activeControl}
            error={(activeErrors as Record<string, { message?: string }>).whatsapp_number?.message}
          />
        </div>

        {/* Email */}
        <Input
          label="Email"
          type="email"
          placeholder="staff@mediguide.lk"
          error={activeErrors.email?.message}
          {...(isEditing ? editForm.register("email") : createForm.register("email"))}
        />

        {/* EPF No | ID Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="EPF No"
            placeholder="e.g. EPF001234"
            {...(isEditing ? editForm.register("epf_no") : createForm.register("epf_no"))}
          />
          <Input
            label="ID Number"
            placeholder="e.g. 200012345678"
            {...(isEditing ? editForm.register("id_number") : createForm.register("id_number"))}
          />
        </div>

        {/* Address */}
        <div>
          <label className="form-label">Address</label>
          <textarea
            rows={2}
            placeholder="Street, City…"
            className="form-input resize-none"
            {...(isEditing ? editForm.register("address") : createForm.register("address"))}
          />
        </div>

      </div>
    </Modal>
  );
}
