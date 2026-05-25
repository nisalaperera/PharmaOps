"use client";

import { useEffect }                              from "react";
import { useForm }                                 from "react-hook-form";
import { zodResolver }                             from "@hookform/resolvers/zod";
import { useMutation, useQueryClient }             from "@tanstack/react-query";
import { Modal }                                   from "@/components/ui/Modal";
import { Button }                                  from "@/components/ui/Button";
import { Badge }                                   from "@/components/ui/Badge";
import { apiPatch }                                from "@/lib/api-client";
import { showToast }                               from "@/lib/toast";
import { CHEQUE_ISSUE_STATUS_VARIANT }             from "@/lib/badges";
import { chequeIssueStatusUpdateSchema }           from "../schemas";
import type { ChequeIssueStatusUpdateFormValues }  from "../schemas";
import type { ChequeIssue }                        from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface UpdateChequeStatusModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  issue:     ChequeIssue | null;
  bookId:    string | null;
}

const STATUS_OPTIONS = [
  { value: "CLEARED",   label: "Cleared",   description: "Cheque was presented and the amount will be deducted from the bank account." },
  { value: "BOUNCED",   label: "Bounced",   description: "Cheque was returned / dishonoured. No balance change." },
  { value: "CANCELLED", label: "Cancelled", description: "Cheque was cancelled before presentation. No balance change." },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function UpdateChequeStatusModal({ isOpen, onClose, issue, bookId }: UpdateChequeStatusModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<ChequeIssueStatusUpdateFormValues>({
    resolver:      zodResolver(chequeIssueStatusUpdateSchema),
    defaultValues: { status: "CLEARED", notes: "" },
  });

  useEffect(() => {
    if (isOpen) form.reset({ status: "CLEARED", notes: "" });
  }, [isOpen]);

  const updateMutation = useMutation({
    mutationFn: (values: ChequeIssueStatusUpdateFormValues) =>
      apiPatch<ChequeIssue>(`/treasury/bank-accounts/cheques/books/${bookId}/issues/${issue!.id}/status`, values),
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["cheque-issues", bookId] });
      queryClient.invalidateQueries({ queryKey: ["cheque-books"] });
      showToast("success", "Status Updated", `Cheque #${issue?.cheque_number} marked as ${values.status.toLowerCase()}.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!issue) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Cheque Status" size="sm">
      {/* Cheque summary */}
      <div className="rounded-xl p-3 mb-4 space-y-1" style={{ background: "var(--color-surface-2)" }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Cheque #{issue.cheque_number}
          </p>
          <Badge variant={CHEQUE_ISSUE_STATUS_VARIANT[issue.status]}>
            {issue.status}
          </Badge>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {issue.payee} · LKR {issue.amount.toFixed(2)} · {issue.issue_date}
        </p>
      </div>

      <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-4">
        <div className="space-y-2">
          <label className="form-label">New Status <span className="text-danger-500">*</span></label>
          {STATUS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors"
              style={{ borderColor: "var(--color-border)" }}
            >
              <input
                type="radio"
                value={opt.value}
                className="mt-0.5 accent-primary-500"
                {...form.register("status")}
              />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{opt.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{opt.description}</p>
              </div>
            </label>
          ))}
          {form.formState.errors.status && (
            <p className="text-xs text-danger-500">{form.formState.errors.status.message}</p>
          )}
        </div>

        <div>
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Optional notes on status change"
            {...form.register("notes")}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={updateMutation.isPending}>
            Update Status
          </Button>
        </div>
      </form>
    </Modal>
  );
}
