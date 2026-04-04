"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost } from "@/lib/api-client";
import { changePasswordSchema, type ChangePasswordFormValues } from "@/app/(pages)/profile/schemas";
import { showToast } from "@/lib/toast";

interface ChangePasswordModalProps {
  isOpen:  boolean;
  onClose: () => void;
  userId:  string;
}

export function ChangePasswordModal({ isOpen, onClose, userId }: ChangePasswordModalProps) {
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<ChangePasswordFormValues>({
      resolver:      zodResolver(changePasswordSchema),
      defaultValues: { current_password: "", new_password: "", confirm_password: "" },
    });

  const mutation = useMutation({
    mutationFn: (data: ChangePasswordFormValues) =>
      apiPost(`/users/${userId}/change-password`, {
        current_password: data.current_password,
        new_password:     data.new_password,
      }),
    onSuccess: () => {
      showToast("success", "Password Changed", "Your password has been updated. Use it on your next login.");
      reset();
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Change Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Password"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit((d) => mutation.mutate(d))}
            isLoading={mutation.isPending}
          >
            Change Password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Current Password"
          type="password"
          placeholder="Enter current password"
          required
          error={errors.current_password?.message}
          {...register("current_password")}
        />
        <Input
          label="New Password"
          type="password"
          placeholder="Minimum 8 characters"
          required
          error={errors.new_password?.message}
          {...register("new_password")}
        />
        <Input
          label="Confirm New Password"
          type="password"
          placeholder="Re-enter new password"
          required
          error={errors.confirm_password?.message}
          {...register("confirm_password")}
        />
      </div>
    </Modal>
  );
}
