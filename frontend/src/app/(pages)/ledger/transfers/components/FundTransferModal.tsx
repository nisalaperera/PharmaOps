"use client";

import { useEffect }       from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver }     from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format }          from "date-fns";
import { Modal }           from "@/components/ui/Modal";
import { Button }          from "@/components/ui/Button";
import { Input }           from "@/components/ui/Input";
import { apiGet, apiPost } from "@/lib/api-client";
import { showToast }       from "@/lib/toast";
import { FUND_SOURCE_TYPE_OPTIONS } from "@/lib/constants";
import {
  fundTransferSchema,
  type FundTransferValues,
} from "@/app/(pages)/ledger/transfers/schemas";
import type { CashRegistry, BankAccount, PaginatedResponse, FundSourceType } from "@/types";

interface FundTransferModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function FundTransferModal({ isOpen, onClose }: FundTransferModalProps) {
  const queryClient = useQueryClient();

  const todayString = format(new Date(), "yyyy-MM-dd");

  const form = useForm<FundTransferValues>({
    resolver:      zodResolver(fundTransferSchema),
    defaultValues: {
      from_source_type: "CASH_REGISTRY",
      from_source_id:   "",
      to_source_type:   "BANK_ACCOUNT",
      to_source_id:     "",
      amount:           0,
      notes:            "",
      transfer_date:    todayString,
    },
  });

  const watchedFromType = useWatch({ control: form.control, name: "from_source_type" });
  const watchedToType   = useWatch({ control: form.control, name: "to_source_type" });
  const watchedFromId   = useWatch({ control: form.control, name: "from_source_id" });

  // â”€â”€ Fetch registries and bank accounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const { data: registriesData } = useQuery<PaginatedResponse<CashRegistry>>({
    queryKey: ["treasury-registries-all"],
    queryFn:  () => apiGet<PaginatedResponse<CashRegistry>>("/treasury/registries", { page_size: 100, is_active: true }),
    enabled:  isOpen,
    staleTime: 2 * 60 * 1000,
  });

  const { data: bankAccountsData } = useQuery<PaginatedResponse<BankAccount>>({
    queryKey: ["treasury-bank-accounts-all"],
    queryFn:  () => apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", { page_size: 100, is_active: true }),
    enabled:  isOpen,
    staleTime: 2 * 60 * 1000,
  });

  const registries    = registriesData?.data    ?? [];
  const bankAccounts  = bankAccountsData?.data  ?? [];

  // â”€â”€ Reset form when modal opens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      from_source_type: "CASH_REGISTRY",
      from_source_id:   "",
      to_source_type:   "BANK_ACCOUNT",
      to_source_id:     "",
      amount:           0,
      notes:            "",
      transfer_date:    todayString,
    });
  }, [isOpen]);

  // â”€â”€ Reset source id when type changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    form.setValue("from_source_id", "");
  }, [watchedFromType]);

  useEffect(() => {
    form.setValue("to_source_id", "");
  }, [watchedToType]);

  // â”€â”€ Source balance hint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function getFromSourceBalance(): string | null {
    if (!watchedFromId) return null;
    if (watchedFromType === "CASH_REGISTRY") {
      const registry = registries.find((r) => r.id === watchedFromId);
      return registry ? `LKR ${registry.current_balance.toFixed(2)}` : null;
    }
    if (watchedFromType === "BANK_ACCOUNT") {
      const account = bankAccounts.find((a) => a.id === watchedFromId);
      return account ? `LKR ${account.current_balance.toFixed(2)}` : null;
    }
    return null;
  }

  // â”€â”€ Source options for selects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function getSourceOptions(sourceType: FundSourceType): { value: string; label: string }[] {
    if (sourceType === "CASH_REGISTRY") {
      return registries.map((r) => ({ value: r.id, label: r.name }));
    }
    return bankAccounts.map((a) => ({ value: a.id, label: `${a.account_name} â€” ${a.bank_name}` }));
  }

  const fromSourceOptions = getSourceOptions(watchedFromType);
  const toSourceOptions   = getSourceOptions(watchedToType);
  const fromBalance       = getFromSourceBalance();

  // â”€â”€ Mutation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const mutation = useMutation({
    mutationFn: (values: FundTransferValues) => apiPost("/treasury/transfers", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["treasury-bank-accounts-all"] });
      queryClient.invalidateQueries({ queryKey: ["treasury-registries-all"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      showToast(
        "success",
        "Transfer Created",
        "Fund transfer has been recorded successfully."
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Transfer Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Fund Transfer" size="md">
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-4"
      >
        {/* From Source Type */}
        <div className="w-full">
          <label className="form-label">
            From Source Type <span className="text-danger-500 ml-1">*</span>
          </label>
          <select className="form-select" {...form.register("from_source_type")}>
            {FUND_SOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {form.formState.errors.from_source_type && (
            <p className="form-error">{form.formState.errors.from_source_type.message}</p>
          )}
        </div>

        {/* From Source */}
        <div className="w-full">
          <label className="form-label">
            From Source <span className="text-danger-500 ml-1">*</span>
          </label>
          <select className="form-select" {...form.register("from_source_id")}>
            <option value="">Select source</option>
            {fromSourceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {fromBalance && (
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Balance: {fromBalance}
            </p>
          )}
          {form.formState.errors.from_source_id && (
            <p className="form-error">{form.formState.errors.from_source_id.message}</p>
          )}
        </div>

        {/* To Source Type */}
        <div className="w-full">
          <label className="form-label">
            To Source Type <span className="text-danger-500 ml-1">*</span>
          </label>
          <select className="form-select" {...form.register("to_source_type")}>
            {FUND_SOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {form.formState.errors.to_source_type && (
            <p className="form-error">{form.formState.errors.to_source_type.message}</p>
          )}
        </div>

        {/* To Source */}
        <div className="w-full">
          <label className="form-label">
            To Destination <span className="text-danger-500 ml-1">*</span>
          </label>
          <select className="form-select" {...form.register("to_source_id")}>
            <option value="">Select destination</option>
            {toSourceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {form.formState.errors.to_source_id && (
            <p className="form-error">{form.formState.errors.to_source_id.message}</p>
          )}
        </div>

        {/* Amount */}
        <div className="w-full">
          <label className="form-label">
            Amount (LKR) <span className="text-danger-500 ml-1">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="form-input"
            placeholder="0.00"
            {...form.register("amount", { valueAsNumber: true })}
          />
          {form.formState.errors.amount && (
            <p className="form-error">{form.formState.errors.amount.message}</p>
          )}
        </div>

        {/* Transfer Date */}
        <div className="w-full">
          <label className="form-label">
            Transfer Date <span className="text-danger-500 ml-1">*</span>
          </label>
          <input
            type="date"
            className="form-input"
            {...form.register("transfer_date")}
          />
          {form.formState.errors.transfer_date && (
            <p className="form-error">{form.formState.errors.transfer_date.message}</p>
          )}
        </div>

        {/* Notes */}
        <Input
          label="Notes"
          placeholder="Optional note about this transfer"
          {...form.register("notes")}
          error={form.formState.errors.notes?.message}
        />

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            Create Transfer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
