"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPatch } from "@/lib/api-client";
import { formatDate, formatPhoneNumber, getRoleLabel, cn } from "@/lib/utils";
import { getRoleBadgeColor } from "@/lib/badges";
import { AvatarUpload } from "@/app/(pages)/profile/components/AvatarUpload";
import { profileSchema, type ProfileFormValues } from "@/app/(pages)/profile/schemas";
import type { User, Branch } from "@/types";
import { showToast } from "@/lib/toast";

export default function ProfilePage() {
  const { user: session } = useAuth();
  const queryClient       = useQueryClient();

  const { data: user, isLoading } = useQuery<User>({
    queryKey:  ["profile", session?.id],
    queryFn:   () => apiGet<User>(`/users/${session!.id}`),
    enabled:   !!session?.id,
    staleTime: 30 * 1000,
  });

  const { data: branch } = useQuery<Branch>({
    queryKey:  ["branch", user?.branch_id],
    queryFn:   () => apiGet<Branch>(`/branches/${user!.branch_id}`),
    enabled:   !!user?.branch_id,
    staleTime: Infinity,
  });

  const { register, handleSubmit, reset, control, formState: { errors, isDirty } } =
    useForm<ProfileFormValues>({
      resolver:      zodResolver(profileSchema),
      defaultValues: { full_name: "", phone: "" },
    });

  useEffect(() => {
    if (user) {
      reset({ full_name: user.full_name, phone: user.phone ?? "" });
    }
  }, [user, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: ProfileFormValues) =>
      apiPatch<User>(`/users/${session!.id}`, {
        full_name: data.full_name,
        phone:     data.phone || undefined,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile", session?.id], updated);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      showToast("success", "Profile Updated", "Your personal information has been saved.");
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (isLoading || !user) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 rounded-full animate-spin"
               style={{ borderColor: "var(--color-border)", borderTopColor: "#008080" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-2xl">
      <div>
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle mt-1">Manage your personal information</p>
      </div>

      {/* Identity card */}
      <div
        className="rounded-2xl shadow-card p-6"
        style={{ background: "var(--color-surface)" }}
      >
        <div className="flex items-center gap-5">
          <AvatarUpload
            userId={user.id}
            fullName={user.full_name}
            avatarUrl={user.avatar_url}
            onUploaded={(url) =>
              queryClient.setQueryData<User>(["profile", session?.id], (prev) =>
                prev ? { ...prev, avatar_url: url } : prev
              )
            }
          />
          <div className="min-w-0">
            <p className="text-xl font-semibold truncate" style={{ color: "var(--color-text)" }}>
              {user.full_name}
            </p>
            <p className="text-sm mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
              {user.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full", getRoleBadgeColor(user.role))}>
                {getRoleLabel(user.role)}
              </span>
              {(branch || user.branch_id === null) && (
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {branch?.name ?? "Organisation"}
                </span>
              )}
            </div>
            {user.last_login_at && (
              <p className="text-[11px] mt-2" style={{ color: "var(--color-text-muted)" }}>
                Last login: {formatDate(user.last_login_at, "long")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Editable info card */}
      <div
        className="rounded-2xl shadow-card p-6 space-y-5"
        style={{ background: "var(--color-surface)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Personal Information
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Update your name and contact details
          </p>
        </div>

        <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))} className="space-y-4">
          <Input
            label="Full Name"
            required
            error={errors.full_name?.message}
            {...register("full_name")}
          />

          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <Input
                label="Phone"
                placeholder="077 123 4567"
                error={errors.phone?.message}
                value={field.value}
                onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                onBlur={field.onBlur}
                maxLength={12}
              />
            )}
          />

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="primary"
              isLoading={updateMutation.isPending}
              disabled={!isDirty}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
