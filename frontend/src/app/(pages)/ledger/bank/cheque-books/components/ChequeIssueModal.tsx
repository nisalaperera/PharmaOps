"use client";

import { useEffect }                        from "react";
import { useForm }                           from "react-hook-form";
import { zodResolver }                       from "@hookform/resolvers/zod";
import { useMutation, useQueryClient }       from "@tanstack/react-query";
import { Modal }                             from "@/components/ui/Modal";
import { Button }                            from "@/components/ui/Button";
import { Input }                             from "@/components/ui/Input";
import { apiPost }                           from "@/lib/api-client";
import { showToast }                         from "@/lib/toast";
import { chequeIssueCreateSchema }           from "../schemas";
import type { ChequeIssueCreateFormValues }  from "../schemas";
import type { ChequeBook, ChequeIssue }      from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChequeIssueModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  chequeBook: ChequeBook | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChequeIssueModal({ isOpen, onClose, chequeBook }: ChequeIssueModalProps) {
  const queryClient = useQueryClient();

  const form = useForm<ChequeIssueCreateFormValues>({
    resolver: zodResolver(chequeIssueCreateSchema),
    defaultValues: {
      cheque_number: undefined,
      payee:         "",
      amount:        undefined,
      issue_date:    new Date().toISOString().slice(0, 10),
      purpose:       "",
      notes:         "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        cheque_number: undefined,
        payee:         "",
        amount:        undefined,
        issue_date:    new Date().toISOString().slice(0, 10),
        purpose:       "",
        notes:         "",
      });
    }
  }, [isOpen]);

  const issueMutation = useMutation({
    mutationFn: (values: ChequeIssueCreateFormValues) =>
      apiPost<ChequeIssue>(`/treasury/bank-accounts/cheques/books/${chequeBook!.id}/issues`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheque-issues", chequeBook?.id] });
      queryClient.invalidateQueries({ queryKey: ["cheque-books"] });
      showToast("success", "Cheque Issued", `Cheque #${form.getValues("cheque_number")} has been recorded.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Issue Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!chequeBook) return null;

  const availableLeaves = chequeBook.total_leaves - chequeBook.used_leaves;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Issue Cheque" size="md">
      {/* Book context */}
      <div className="rounded-xl p-3 mb-4 space-y-1" style={{ background: "var(--color-surface-2)" }}>
        <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Cheque Book</p>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          {chequeBook.series_name}
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {chequeBook.bank_account_name} · {chequeBook.bank_name} ·{" "}
          Range {chequeBook.start_number}–{chequeBook.end_number} ·{" "}
          <span className={availableLeaves === 0 ? "text-danger-500" : "text-emerald-600 dark:text-emerald-400"}>
            {availableLeaves} leaf{availableLeaves !== 1 ? "ves" : ""} available
          </span>
        </p>
      </div>

      <form onSubmit={form.handleSubmit((v) => issueMutation.mutate(v))} className="space-y-4">
        <Input
          label="Cheque Number"
          type="number"
          placeholder={`${chequeBook.start_number}–${chequeBook.end_number}`}
          required
          error={form.formState.errors.cheque_number?.message}
          {...form.register("cheque_number")}
        />

        <Input
          label="Payee"
          placeholder="Name of person / organization"
          required
          error={form.formState.errors.payee?.message}
          {...form.register("payee")}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount (LKR)"
            type="number"
            step="0.01"
            placeholder="0.00"
            required
            error={form.formState.errors.amount?.message}
            {...form.register("amount")}
          />
          <Input
            label="Issue Date"
            type="date"
            required
            error={form.formState.errors.issue_date?.message}
            {...form.register("issue_date")}
          />
        </div>

        <Input
          label="Purpose"
          placeholder="e.g. Supplier payment, Rent"
          error={form.formState.errors.purpose?.message}
          {...form.register("purpose")}
        />

        <div>
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Optional notes"
            {...form.register("notes")}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={issueMutation.isPending}>
            Issue Cheque
          </Button>
        </div>
      </form>
    </Modal>
  );
}
