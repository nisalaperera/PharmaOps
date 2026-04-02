"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { formatPhoneNumber, generatePassword, cn } from "@/lib/utils";
import { ROLE_OPTIONS, USER_STATUS_OPTIONS, BRANCH_ROLES } from "@/lib/constants";
import { userCreateSchema, userEditSchema, type UserCreateValues, type UserEditValues } from "./schemas";
import type { User, Branch, PaginatedResponse, UserRole } from "@/types";
import toast from "react-hot-toast";

interface UserModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  editingUser: User | null;
  onCreated:   (password: string, name: string) => void;
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

  const watchedRole  = isEditing ? editForm.watch("role") : createForm.watch("role");
  const isBranchRole = BRANCH_ROLES.includes(watchedRole as UserRole);

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
      toast.success("User updated");
      onClose();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Something went wrong");
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
            toast.success("User created");
            onCreated(password, user.full_name);
            onClose();
          })
          .catch((err: { message?: string }) => {
            toast.error(err?.message ?? "Something went wrong");
          });
      })();
    }
  }

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit User" : "New User"}
      size="lg"
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
              className="form-input"
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

        {/* Status — edit only */}
        {isEditing && (
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" {...editForm.register("status")}>
              {USER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

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
