"use client";

import { useEffect }                         from "react";
import { useForm }                            from "react-hook-form";
import { zodResolver }                        from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal }                              from "@/components/ui/Modal";
import { Button }                             from "@/components/ui/Button";
import { Input }                              from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch }          from "@/lib/api-client";
import { showToast }                          from "@/lib/toast";
import { chequeBookCreateSchema, chequeBookEditSchema } from "../schemas";
import type { ChequeBookCreateFormValues, ChequeBookEditFormValues } from "../schemas";
import type { BankAccount, ChequeBook, PaginatedResponse } from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChequeBookModalProps {
  isOpen:         boolean;
  onClose:        () => void;
  editingBook:    ChequeBook | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChequeBookModal({ isOpen, onClose, editingBook }: ChequeBookModalProps) {
  const isEditing    = !!editingBook;
  const queryClient  = useQueryClient();

  // ── Active bank accounts for dropdown ────────────────────────────────────────

  const { data: accountsData } = useQuery<PaginatedResponse<BankAccount>>({
    queryKey: ["bank-accounts-active"],
    queryFn:  () => apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", { is_active: "true", page_size: 200 }),
    enabled:  isOpen && !isEditing,
  });
  const activeAccounts = accountsData?.data ?? [];

  // ── Create form ───────────────────────────────────────────────────────────────

  const createForm = useForm<ChequeBookCreateFormValues>({
    resolver: zodResolver(chequeBookCreateSchema),
    defaultValues: {
      bank_account_id: "",
      series_name:     "",
      start_number:    undefined,
      end_number:      undefined,
      notes:           "",
    },
  });

  // ── Edit form ─────────────────────────────────────────────────────────────────

  const editForm = useForm<ChequeBookEditFormValues>({
    resolver: zodResolver(chequeBookEditSchema),
    defaultValues: {
      series_name: "",
      notes:       "",
    },
  });

  useEffect(() => {
    if (isOpen && editingBook) {
      editForm.reset({ series_name: editingBook.series_name, notes: editingBook.notes ?? "" });
    } else if (isOpen && !editingBook) {
      createForm.reset({
        bank_account_id: "",
        series_name:     "",
        start_number:    undefined,
        end_number:      undefined,
        notes:           "",
      });
    }
  }, [isOpen, editingBook]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (values: ChequeBookCreateFormValues) =>
      apiPost<ChequeBook>("/treasury/bank-accounts/cheques/books", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheque-books"] });
      showToast("success", "Cheque Book Created", "The cheque book has been registered.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const editMutation = useMutation({
    mutationFn: (values: ChequeBookEditFormValues) =>
      apiPatch<ChequeBook>(`/treasury/bank-accounts/cheques/books/${editingBook!.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheque-books"] });
      showToast("success", "Cheque Book Updated", "Changes have been saved.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Update Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const handleClose = () => {
    createForm.reset();
    editForm.reset();
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? "Edit Cheque Book" : "Add Cheque Book"}
      size="md"
    >
      {isEditing ? (
        /* ── Edit form ─────────────────────────────────────────────────────────── */
        <form onSubmit={editForm.handleSubmit((v) => editMutation.mutate(v))} className="space-y-4">
          {/* Account info — read-only */}
          <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--color-surface-2)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Bank Account</p>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {editingBook.bank_account_name}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {editingBook.bank_name} · Cheque range {editingBook.start_number}–{editingBook.end_number}
            </p>
          </div>

          <Input
            label="Series Name"
            placeholder="e.g. Book 001, Series A"
            error={editForm.formState.errors.series_name?.message}
            {...editForm.register("series_name")}
          />

          <div>
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Optional notes"
              {...editForm.register("notes")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={editMutation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      ) : (
        /* ── Create form ────────────────────────────────────────────────────────── */
        <form onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="form-label">Bank Account <span className="text-danger-500">*</span></label>
            <select
              className="form-select"
              {...createForm.register("bank_account_id")}
            >
              <option value="">Select bank account…</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} — {account.bank_name} ({account.branch_name})
                </option>
              ))}
            </select>
            {createForm.formState.errors.bank_account_id && (
              <p className="text-xs text-danger-500">{createForm.formState.errors.bank_account_id.message}</p>
            )}
          </div>

          <Input
            label="Series Name"
            placeholder="e.g. Book 001, Series A"
            required
            error={createForm.formState.errors.series_name?.message}
            {...createForm.register("series_name")}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Number"
              type="number"
              placeholder="e.g. 1001"
              required
              error={createForm.formState.errors.start_number?.message}
              {...createForm.register("start_number")}
            />
            <Input
              label="End Number"
              type="number"
              placeholder="e.g. 1050"
              required
              error={createForm.formState.errors.end_number?.message}
              {...createForm.register("end_number")}
            />
          </div>
          {createForm.formState.errors.end_number?.message && (
            <p className="text-xs text-danger-500 -mt-2">
              {createForm.formState.errors.end_number.message}
            </p>
          )}

          <div>
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Optional notes"
              {...createForm.register("notes")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending}>
              Create Cheque Book
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
