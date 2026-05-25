"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }   from "@/components/ui/Modal";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { getStaffDisplayName, cn } from "@/lib/utils";
import {
  attendanceCreateSchema,
  attendanceEditSchema,
  type AttendanceCreateValues,
  type AttendanceEditValues,
} from "@/app/(pages)/staff/attendance/schemas";
import { useAuth } from "@/hooks/useAuth";
import { showToast } from "@/lib/toast";
import type { Attendance, Staff, Branch, PaginatedResponse } from "@/types";

interface AttendanceModalProps {
  isOpen:            boolean;
  onClose:           () => void;
  editingAttendance: Attendance | null;
}

export function AttendanceModal({ isOpen, onClose, editingAttendance }: AttendanceModalProps) {
  const queryClient = useQueryClient();
  const { user: me, permissions } = useAuth();
  const isEditing   = editingAttendance !== null;

  // Fetch branches (org-level only)
  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled:   permissions?.isOrgLevel ?? false,
  });
  const branches = branchesData?.data ?? [];

  // ─── Create form ─────────────────────────────────────────────────────────────

  const today    = new Date().toISOString().split("T")[0];
  const branchId = me?.branchId ?? "";

  const createForm = useForm<AttendanceCreateValues>({
    resolver:      zodResolver(attendanceCreateSchema),
    defaultValues: {
      staff_id:  "",
      branch_id: branchId,
      date:      today,
      clock_in:  "",
      clock_out: "",
      notes:     "",
    },
  });

  // For org-level users, track the selected branch in React state so TanStack Query
  // picks up the new key synchronously on the same render cycle as the branch change.
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const staffQueryBranch = permissions?.isOrgLevel ? selectedBranchId : branchId;

  // Fetch staff for the selected/auto-set branch (unpaginated dropdown endpoint)
  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey:  ["staff-by-branch", staffQueryBranch],
    queryFn:   () => apiGet<Staff[]>(`/staff/by-branch/${staffQueryBranch}`),
    staleTime: 2 * 60 * 1000,
    enabled:   !isEditing && !!staffQueryBranch,
  });

  // ─── Edit form ───────────────────────────────────────────────────────────────

  const editForm = useForm<AttendanceEditValues>({
    resolver:      zodResolver(attendanceEditSchema),
    defaultValues: {
      clock_in:  "",
      clock_out: "",
      notes:     "",
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      editForm.reset({
        clock_in:  editingAttendance.clock_in  ?? "",
        clock_out: editingAttendance.clock_out ?? "",
        notes:     editingAttendance.notes ?? "",
      });
    } else {
      setSelectedBranchId("");
      createForm.reset({
        staff_id:  "",
        branch_id: branchId,
        date:      today,
        clock_in:  "",
        clock_out: "",
        notes:     "",
      });
    }
  }, [isOpen, isEditing, editingAttendance, createForm, editForm, branchId, today]);

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: AttendanceCreateValues) =>
      apiPost<Attendance>("/staff/attendance", {
        ...data,
        branch_id: staffQueryBranch,
        clock_in:  data.clock_in  || null,
        clock_out: data.clock_out || null,
        notes:     data.notes     || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-totals"] });
      showToast("success", "Attendance Recorded", "The attendance entry has been saved.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: AttendanceEditValues) =>
      apiPatch<Attendance>(`/staff/attendance/${editingAttendance!.id}`, {
        ...data,
        clock_in:  data.clock_in  || null,
        clock_out: data.clock_out || null,
        notes:     data.notes     || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-totals"] });
      showToast("success", "Attendance Updated", "The attendance record has been saved.");
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Attendance" : "Record Attendance"}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isPending}>
            {isEditing ? "Save Changes" : "Record Attendance"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Edit-mode: read-only info header */}
        {isEditing && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: "var(--color-surface-2)" }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: "#008080" }}
            >
              {editingAttendance.staff_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold" style={{ color: "var(--color-text)" }}>
                {editingAttendance.staff_name}
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {editingAttendance.date}
              </p>
            </div>
          </div>
        )}

        {/* Create-only fields */}
        {!isEditing && (
          <>
            {/* Branch — org-level users only; branch-level value is set in defaultValues/reset */}
            {permissions?.isOrgLevel ? (
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
                      value={field.value}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      onChange={(e) => {
                        field.onChange(e.target.value);          // updates form store
                        setSelectedBranchId(e.target.value);     // drives staff query key
                        createForm.setValue("staff_id", "");     // reset staff on branch change
                      }}
                    >
                      <option value="">Select branch…</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                />
                {createForm.formState.errors.branch_id && (
                  <p className="form-error">{createForm.formState.errors.branch_id.message}</p>
                )}
              </div>
            ) : null}

            {/* Staff member — enabled only after branch is resolved */}
            <div>
              <label className="form-label">
                Staff Member <span className="text-danger-500">*</span>
              </label>
              <select
                className={cn(
                  "form-select",
                  createForm.formState.errors.staff_id && "border-danger-500",
                  !staffQueryBranch && "opacity-50 cursor-not-allowed"
                )}
                disabled={!staffQueryBranch}
                {...createForm.register("staff_id")}
              >
                <option value="">
                  {staffQueryBranch ? "Select staff member…" : "Select a branch first…"}
                </option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{getStaffDisplayName(s)}</option>
                ))}
              </select>
              {createForm.formState.errors.staff_id && (
                <p className="form-error">{createForm.formState.errors.staff_id.message}</p>
              )}
            </div>

            {/* Date */}
            <Input
              label="Date"
              type="date"
              required
              error={createForm.formState.errors.date?.message}
              {...createForm.register("date")}
            />
          </>
        )}

        {/* Clock In / Clock Out */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <Input
                label="Clock In"
                type="time"
                error={editForm.formState.errors.clock_in?.message}
                {...editForm.register("clock_in")}
              />
              <Input
                label="Clock Out"
                type="time"
                error={editForm.formState.errors.clock_out?.message}
                {...editForm.register("clock_out")}
              />
            </>
          ) : (
            <>
              <Input
                label="Clock In"
                type="time"
                error={createForm.formState.errors.clock_in?.message}
                {...createForm.register("clock_in")}
              />
              <Input
                label="Clock Out"
                type="time"
                error={createForm.formState.errors.clock_out?.message}
                {...createForm.register("clock_out")}
              />
            </>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            rows={2}
            placeholder="Optional notes…"
            className="form-input resize-none"
            {...(isEditing ? editForm.register("notes") : createForm.register("notes"))}
          />
        </div>

      </div>
    </Modal>
  );
}
