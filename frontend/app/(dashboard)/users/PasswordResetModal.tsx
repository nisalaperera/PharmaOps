"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost } from "@/lib/api-client";
import { generatePassword } from "@/lib/utils";
import { passwordResetSchema, type PasswordResetValues } from "./schemas";
import type { User } from "@/types";
import toast from "react-hot-toast";

interface PasswordResetModalProps {
  isOpen:  boolean;
  onClose: () => void;
  user:    User | null;
}

export function PasswordResetModal({ isOpen, onClose, user }: PasswordResetModalProps) {
  const queryClient  = useQueryClient();
  const [generatedPw, setGeneratedPw] = useState("");

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<PasswordResetValues>({
    resolver:      zodResolver(passwordResetSchema),
    defaultValues: { new_password: "" },
  });

  useEffect(() => {
    if (isOpen) {
      setValue("new_password", "");
      setGeneratedPw("");
    }
  }, [isOpen, setValue]);

  function handleAutoGenerate() {
    const pw = generatePassword();
    setValue("new_password", pw);
    setGeneratedPw(pw);
  }

  const mutation = useMutation({
    mutationFn: (data: PasswordResetValues) => {
      const password = data.new_password || generatePassword();
      return apiPost(`/users/${user!.id}/reset-password`, { new_password: password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Password reset successfully");
      onClose();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Something went wrong");
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reset Password"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSubmit((d) => mutation.mutate(d))}
            isLoading={mutation.isPending}
          >
            Reset Password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Resetting password for{" "}
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>
            {user?.full_name}
          </span>
          . Leave blank to auto-generate.
        </p>
        <Input
          label="New Password"
          type="text"
          placeholder="Leave blank to auto-generate"
          error={errors.new_password?.message}
          {...register("new_password")}
        />
        <Button variant="outline" size="sm" onClick={handleAutoGenerate} type="button">
          Auto-generate password
        </Button>
        {generatedPw && (
          <p
            className="text-xs font-mono p-2 rounded"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
          >
            Generated: {generatedPw}
          </p>
        )}
      </div>
    </Modal>
  );
}
