"use client";

import { useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { formatPhoneNumber, generatePassword, cn } from "@/lib/utils";
import { ROLE_OPTIONS, BRANCH_ROLES } from "@/lib/constants";
import { userCreateSchema, userEditSchema, type UserCreateValues, type UserEditValues } from "@/app/(pages)/users/schemas";
import type { User, Branch, PaginatedResponse, UserRole, UserStatus } from "@/types";
import { showToast } from "@/lib/toast";

interface UserModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  editingUser: User | null;
  onCreated:   (password: string, name: string) => void;
}

// ─── Small status toggle for modal header ────────────────────────────────────

function StatusToggle({ value, onChange }: { value: UserStatus; onChange: (v: UserStatus) => void }) {
  const isActive = value === "ACTIVE";
  return (
    <button
      type="button"
      onClick={() => onChange(isActive ? "INACTIVE" : "ACTIVE")}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors select-none",
        isActive
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isActive ? "bg-emerald-500" : "bg-slate-400")} />
      {isActive ? "Active" : "Inactive"}
    </button>
  );
}

export function UserModal({ isOpen, onClose, editingUser, onCreated }: UserModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingUser !== null;

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const branches = branchesData?.data ?? [];

  const createForm = useForm<UserCreateValues>({
    resolver:      zodResolver(userCreateSchema),
    defaultValues: { full_name: "", email: "", phone: "", role: "BRANCH_USER", branch_id: "", password: "" },
  });

  const editForm = useForm<UserEditValues>({
    resolver:      zodResolver(userEditSchema),
    defaultValues: { full_name: "", phone: "", role: "BRANCH_USER", branch_id: "", status: "ACTIVE" },
  });

  const watchedRole   = isEditing ? editForm.watch("role") : createForm.watch("role");
  const isBranchRole  = BRANCH_ROLES.includes(watchedRole as UserRole);
  const watchedStatus = useWatch({ control: editForm.control, name: "status" });

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      editForm.reset({
        full_name: editingUser.full_name,
        phone:     editingUser.phone ?? "",
        role:      editingUser.role,
        branch_id: editingUser.branch_id ?? "",
        status:    editingUser.status,
      });
    } else {
      createForm.reset({ full_name: "", email: "", phone: "", role: "BRANCH_USER", branch_id: "", password: "" });
    }
  }, [isOpen, isEditing, editingUser, createForm, editForm]);

  const editMutation = useMutation({
    mutationFn: (data: UserEditValues) =>
      apiPatch<User>(`/users/${editingUser!.id}`, {
        ...data,
        branch_id: isBranchRole ? data.branch_id : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      showToast("success", "User Updated", `${editingUser!.full_name}'s details have been saved.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const isPending = editMutation.isPending;

  function handleSubmit() {
    if (isEditing) {
      editForm.handleSubmit((data) => editMutation.mutate(data))();
    } else {
      createForm.handleSubmit((data) => {
        const password = data.password || generatePassword();
        apiPost<User>("/users", {
          full_name: data.full_name,
          email:     data.email.toLowerCase().trim(),
          phone:     data.phone || undefined,
          role:      data.role,
          branch_id: isBranchRole ? data.branch_id || undefined : undefined,
          password,
        })
          .then((user) => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            showToast("success", "User Created", `${user.full_name} has been added to the system.`);
            onCreated(password, user.full_name);
            onClose();
          })
          .catch((err: { message?: string }) => {
            showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again.");
          });
      })();
    }
  }

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  // Status toggle shown in the header only when editing
  const headerExtra = isEditing ? (
    <StatusToggle
      value={watchedStatus}
      onChange={(v) => editForm.setValue("status", v, { shouldDirty: true })}
    />
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit User" : "New User"}
      size="lg"
      headerExtra={headerExtra}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isPending}>
            {isEditing ? "Save Changes" : "Create User"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Full Name */}
        {isEditing ? (
          <Input
            label="Full Name"
            placeholder="e.g. Kamal Perera"
            required
            error={editForm.formState.errors.full_name?.message}
            {...editForm.register("full_name")}
          />
        ) : (
          <Input
            label="Full Name"
            placeholder="e.g. Kamal Perera"
            required
            error={createForm.formState.errors.full_name?.message}
            {...createForm.register("full_name")}
          />
        )}

        {/* Email — create only */}
        {!isEditing && (
          <Input
            label="Email"
            type="email"
            placeholder="user@mediguide.lk"
            required
            error={createForm.formState.errors.email?.message}
            {...createForm.register("email")}
          />
        )}

        {/* Phone */}
        {isEditing ? (
          <Controller
            name="phone"
            control={editForm.control}
            render={({ field }) => (
              <Input
                label="Phone"
                placeholder="077 123 4567"
                error={editForm.formState.errors.phone?.message}
                value={field.value}
                onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                onBlur={field.onBlur}
                maxLength={12}
              />
            )}
          />
        ) : (
          <Controller
            name="phone"
            control={createForm.control}
            render={({ field }) => (
              <Input
                label="Phone"
                placeholder="077 123 4567"
                error={createForm.formState.errors.phone?.message}
                value={field.value}
                onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                onBlur={field.onBlur}
                maxLength={12}
              />
            )}
          />
        )}

        {/* Role + Branch row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">
              Role <span className="text-danger-500">*</span>
            </label>
            <select
              className="form-select"
              {...(isEditing ? editForm.register("role") : createForm.register("role"))}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {(isEditing ? editForm.formState.errors.role : createForm.formState.errors.role) && (
              <p className="form-error">Role is required</p>
            )}
          </div>

          {isBranchRole && (
            <div>
              <label className="form-label">
                Branch <span className="text-danger-500">*</span>
              </label>
              <select
                className={cn(
                  "form-input",
                  (isEditing ? editForm.formState.errors.branch_id : createForm.formState.errors.branch_id) &&
                    "border-danger-500"
                )}
                {...(isEditing ? editForm.register("branch_id") : createForm.register("branch_id"))}
              >
                <option value="">Select branch…</option>
                {branchOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {(isEditing ? editForm.formState.errors.branch_id : createForm.formState.errors.branch_id) && (
                <p className="form-error">Branch is required</p>
              )}
            </div>
          )}
        </div>

        {/* Password — create only */}
        {!isEditing && (
          <Input
            label="Password"
            type="text"
            placeholder="Leave blank to auto-generate"
            helperText="Minimum 8 characters. Leave blank to auto-generate."
            error={createForm.formState.errors.password?.message}
            {...createForm.register("password")}
          />
        )}
      </div>
    </Modal>
  );
}
