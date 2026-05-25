"use client";

import { useEffect }              from "react";
import { useForm }                from "react-hook-form";
import { zodResolver }            from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal }                  from "@/components/ui/Modal";
import { Button }                 from "@/components/ui/Button";
import { Input }                  from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast }              from "@/lib/toast";
import { posMachineSchema, posMachineUpdateSchema, type PosMachineValues, type PosMachineUpdateValues } from "../schemas";
import type { BankAccount, PosMachine, PaginatedResponse } from "@/types";

interface PosMachineModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  editingMachine: PosMachine | null;
}

export function PosMachineModal({ isOpen, onClose, editingMachine }: PosMachineModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = !!editingMachine;

  const createForm = useForm<PosMachineValues>({
    resolver:      zodResolver(posMachineSchema),
    defaultValues: { bank_account_id: "", terminal_id: "", merchant_id: "", notes: "" },
  });

  const editForm = useForm<PosMachineUpdateValues>({
    resolver:      zodResolver(posMachineUpdateSchema),
    defaultValues: { terminal_id: "", merchant_id: "", notes: "" },
  });

  const form = isEditing ? editForm : createForm;

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing && editingMachine) {
      editForm.reset({
        terminal_id: editingMachine.terminal_id,
        merchant_id: editingMachine.merchant_id ?? "",
        notes:       editingMachine.notes ?? "",
      });
    } else {
      createForm.reset({ bank_account_id: "", terminal_id: "", merchant_id: "", notes: "" });
    }
  }, [isOpen, editingMachine]);

  const { data: accountsData } = useQuery<PaginatedResponse<BankAccount>>({
    queryKey: ["bank-accounts-active"],
    queryFn:  () => apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", { is_active: "true", page_size: 200 }),
    enabled:  isOpen && !isEditing,
  });
  const activeAccounts = accountsData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (values: PosMachineValues | PosMachineUpdateValues) =>
      isEditing
        ? apiPatch<PosMachine>(`/treasury/bank-accounts/pos-machines/machines/${editingMachine!.id}`, values)
        : apiPost<PosMachine>("/treasury/bank-accounts/pos-machines/machines", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-machines"] });
      showToast(
        "success",
        isEditing ? "POS Machine Updated" : "POS Machine Created",
        isEditing ? "Machine details have been updated." : "New POS machine has been added.",
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", isEditing ? "Update Failed" : "Create Failed", err?.message ?? "Something went wrong.");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit POS Machine" : "Add POS Machine"} size="md">
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v as PosMachineValues & PosMachineUpdateValues))}
        className="space-y-4"
      >
        {!isEditing && (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Bank Account <span className="text-danger-500">*</span>
            </label>
            <select
              {...(createForm.register("bank_account_id"))}
              className="form-select w-full"
            >
              <option value="">Select bank account…</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name} — {a.bank_name}
                </option>
              ))}
            </select>
            {createForm.formState.errors.bank_account_id && (
              <p className="text-xs text-danger-500 mt-1">{createForm.formState.errors.bank_account_id.message}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Terminal ID (TID) <span className="text-danger-500">*</span>
          </label>
          <Input
            placeholder="e.g. TID-001"
            {...form.register("terminal_id")}
            error={form.formState.errors.terminal_id?.message}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Merchant ID (MID){" "}
            <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
          </label>
          <Input
            placeholder="e.g. MID-123456"
            {...form.register("merchant_id")}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Notes{" "}
            <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
          </label>
          <textarea
            {...form.register("notes")}
            rows={2}
            className="form-input w-full resize-none"
            placeholder="Any notes about this POS machine…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Add Machine"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
