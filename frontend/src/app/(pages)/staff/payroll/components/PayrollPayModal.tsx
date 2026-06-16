"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { apiGet, apiPost } from "@/lib/api-client";
import { showToast } from "@/lib/toast";
import { FUND_SOURCE_TYPE_OPTIONS, MONTH_OPTIONS } from "@/lib/constants";
import { payrollPaySchema, type PayrollPayValues } from "@/app/(pages)/staff/payroll/schemas";
import type { Payroll, CashRegistry, BankAccount, PaginatedResponse } from "@/types";

interface PayrollPayModalProps {
  payroll: Payroll | null;
  onClose: () => void;
}

export function PayrollPayModal({ payroll, onClose }: PayrollPayModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PayrollPayValues>({
    resolver: zodResolver(payrollPaySchema),
    defaultValues: { source_type: "CASH_REGISTRY", source_id: "", notes: "" },
  });

  const sourceType = watch("source_type");
  const sourceId   = watch("source_id");

  useEffect(() => {
    if (payroll) {
      reset({ source_type: "CASH_REGISTRY", source_id: "", notes: "" });
    }
  }, [payroll, reset]);

  // Reset the source selection when switching source type
  useEffect(() => {
    setValue("source_id", "");
  }, [sourceType, setValue]);

  const { data: registriesData } = useQuery<PaginatedResponse<CashRegistry>>({
    queryKey: ["pay-registries", payroll?.branch_id],
    queryFn:  () => apiGet<PaginatedResponse<CashRegistry>>("/treasury/registries", {
      branch_id: payroll!.branch_id, is_active: "true", page_size: 100,
    }),
    enabled: !!payroll && sourceType === "CASH_REGISTRY",
  });

  const { data: accountsData } = useQuery<PaginatedResponse<BankAccount>>({
    queryKey: ["pay-bank-accounts", payroll?.branch_id],
    queryFn:  () => apiGet<PaginatedResponse<BankAccount>>("/treasury/bank-accounts", {
      branch_id: payroll!.branch_id, is_active: "true", page_size: 100,
    }),
    enabled: !!payroll && sourceType === "BANK_ACCOUNT",
  });

  const registries = registriesData?.data ?? [];
  const accounts   = accountsData?.data   ?? [];

  const sourceOptions =
    sourceType === "CASH_REGISTRY"
      ? registries.map((r) => ({
          value: r.id,
          label: `${r.name}${r.is_open ? "" : " (Closed)"} - Balance ${r.current_balance.toFixed(2)}`,
        }))
      : accounts.map((a) => ({
          value: a.id,
          label: `${a.account_name} (${a.bank_name}) - Balance ${a.current_balance.toFixed(2)}`,
        }));

  const selectedBalance =
    sourceType === "CASH_REGISTRY"
      ? registries.find((r) => r.id === sourceId)?.current_balance
      : accounts.find((a) => a.id === sourceId)?.current_balance;

  const insufficientBalance =
    !!payroll && selectedBalance !== undefined && selectedBalance < payroll.net_salary;

  const mutation = useMutation({
    mutationFn: (values: PayrollPayValues) =>
      apiPost<Payroll>(`/staff/payroll/${payroll!.id}/pay`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      queryClient.invalidateQueries({ queryKey: ["registries"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      showToast(
        "success",
        "Payroll Paid",
        `${payroll!.staff_name}'s salary has been paid and recorded in the ledger.`,
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Payment Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  if (!payroll) return null;

  const monthLabel = MONTH_OPTIONS.find((m) => Number(m.value) === payroll.month)?.label ?? payroll.month;

  return (
    <Modal isOpen={!!payroll} onClose={onClose} title="Pay Payroll" size="sm">
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">

        {/* Payroll summary */}
        <div className="rounded-xl px-4 py-3 space-y-1 text-sm" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Staff Member</span>
            <span className="font-medium" style={{ color: "var(--color-text)" }}>{payroll.staff_name}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Period</span>
            <span style={{ color: "var(--color-text)" }}>{monthLabel} {payroll.year}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span style={{ color: "var(--color-text-muted)" }}>Net Salary</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{payroll.net_salary.toFixed(2)}</span>
          </div>
        </div>

        {/* Source type */}
        <Select
          label="Pay From"
          required
          options={FUND_SOURCE_TYPE_OPTIONS}
          error={errors.source_type?.message}
          {...register("source_type")}
        />

        {/* Source */}
        <Select
          label={sourceType === "CASH_REGISTRY" ? "Cash Registry" : "Bank Account"}
          required
          options={[
            { value: "", label: sourceOptions.length ? "Select a source…" : "No active sources for this branch" },
            ...sourceOptions,
          ]}
          error={errors.source_id?.message}
          {...register("source_id")}
        />

        {insufficientBalance && (
          <p className="text-xs font-medium text-danger-500">
            Insufficient balance — the selected source holds {selectedBalance!.toFixed(2)} but {payroll.net_salary.toFixed(2)} is required.
          </p>
        )}

        {/* Notes */}
        <Textarea
          label="Notes"
          placeholder="Optional notes…"
          error={errors.notes?.message}
          {...register("notes")}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={mutation.isPending}
            disabled={!sourceId || insufficientBalance}
          >
            Pay {payroll.net_salary.toFixed(2)}
          </Button>
        </div>

      </form>
    </Modal>
  );
}
