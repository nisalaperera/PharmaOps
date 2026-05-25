"use client";

import { useEffect } from "react";
import { useForm }   from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }     from "@/components/ui/Modal";
import { Button }    from "@/components/ui/Button";
import { Input }     from "@/components/ui/Input";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { showToast }  from "@/lib/toast";
import {
  bankAccountCreateSchema,
  bankAccountEditSchema,
  type BankAccountCreateValues,
  type BankAccountEditValues,
} from "@/app/(pages)/ledger/bank-accounts/schemas";
import type { BankAccount, Branch, PaginatedResponse } from "@/types";

interface BankAccountModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingAccount:  BankAccount | null;
}

export function BankAccountModal({ isOpen, onClose, editingAccount }: BankAccountModalProps) {
  const queryClient = useQueryClient();
  const isEditing   = editingAccount !== null;

  const form = useForm<BankAccountCreateValues>({
    resolver:      zodResolver(isEditing ? bankAccountEditSchema : bankAccountCreateSchema),
    defaultValues: { bank_name: "", account_number: "", account_name: "", branch_id: "" },
  });

  // â”€â”€ Fetch branches for the select dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { data: branchData } = useQuery<PaginatedResponse<Branch>>({
    queryKey: ["branches-all"],
    queryFn:  () => apiGet<PaginatedResponse<Branch>>("/branches", { page_size: 200 }),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const branches = branchData?.data ?? [];

  // â”€â”€ Reset form when modal opens / switches mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!isOpen) return;
    if (isEditing) {
      form.reset({
        bank_name:      editingAccount.bank_name,
        account_number: editingAccount.account_number,
        account_name:   editingAccount.account_name,
        branch_id:      editingAccount.branch_id,
      });
    } else {
      form.reset({ bank_name: "", account_number: "", account_name: "", branch_id: "" });
    }
  }, [isOpen, editingAccount]);

  // â”€â”€ Mutation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const mutation = useMutation({
    mutationFn: (values: BankAccountCreateValues | BankAccountEditValues) =>
      isEditing
        ? apiPatch<BankAccount>(`/treasury/bank-accounts/${editingAccount!.id}`, values)
        : apiPost<BankAccount>("/treasury/bank-accounts", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      showToast(
        "success",
        isEditing ? "Account Updated" : "Account Created",
        isEditing
          ? "Bank account details have been updated."
          : "New bank account has been created successfully."
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast(
        "error",
        isEditing ? "Update Failed" : "Create Failed",
        err?.message ?? "Something went wrong. Please try again."
      );
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Bank Account" : "New Bank Account"}
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-4"
      >
        {/* Branch */}
        <div className="w-full">
          <label className="form-label">
            Branch <span className="text-danger-500 ml-1">*</span>
          </label>
          <select
            className="form-select"
            {...form.register("branch_id")}
          >
            <option value="">Select branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {form.formState.errors.branch_id && (
            <p className="form-error">{form.formState.errors.branch_id.message}</p>
          )}
        </div>

        {/* Bank Name */}
        <Input
          label="Bank Name"
          placeholder="e.g. Commercial Bank of Ceylon"
          required
          {...form.register("bank_name")}
          error={form.formState.errors.bank_name?.message}
        />

        {/* Account Number */}
        <Input
          label="Account Number"
          placeholder="e.g. 1234567890"
          required
          {...form.register("account_number")}
          error={form.formState.errors.account_number?.message}
        />

        {/* Account Name */}
        <Input
          label="Account Name"
          placeholder="e.g. Medi Guide Pharmacy â€” Colombo"
          required
          {...form.register("account_name")}
          error={form.formState.errors.account_name?.message}
        />

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {isEditing ? "Save Changes" : "Create Account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
