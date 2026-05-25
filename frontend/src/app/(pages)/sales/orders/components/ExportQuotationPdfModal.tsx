"use client";

import { useEffect }       from "react";
import { useForm }         from "react-hook-form";
import { zodResolver }     from "@hookform/resolvers/zod";
import { useMutation }     from "@tanstack/react-query";
import { Download }        from "lucide-react";
import { Modal }           from "@/components/ui/Modal";
import { Button }          from "@/components/ui/Button";
import { Input }           from "@/components/ui/Input";
import { apiClient, downloadBlob } from "@/lib/api-client";
import { showToast }       from "@/lib/toast";
import { exportQuotationPdfSchema, type ExportQuotationPdfValues } from "../schemas";
import type { SalesOrder } from "@/types";

interface ExportQuotationPdfModalProps {
  isOpen:  boolean;
  onClose: () => void;
  order:   SalesOrder | null;
}

export function ExportQuotationPdfModal({ isOpen, onClose, order }: ExportQuotationPdfModalProps) {
  const form = useForm<ExportQuotationPdfValues>({
    resolver:      zodResolver(exportQuotationPdfSchema),
    defaultValues: { validity_days: 30, notes: "" },
  });

  useEffect(() => {
    if (isOpen) form.reset({ validity_days: 30, notes: "" });
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: async (values: ExportQuotationPdfValues) => {
      const response = await apiClient.post(
        `/sales/orders/${order!.id}/quotation-pdf`,
        values,
        { responseType: "blob" },
      );
      return response.data as Blob;
    },
    onSuccess: (blob) => {
      const orderRef = order!.id.slice(-8).toUpperCase();
      downloadBlob(blob, `quotation-${orderRef}.pdf`);
      showToast("success", "PDF Downloaded", "Quotation PDF has been downloaded successfully.");
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Download Failed", err?.message ?? "Could not generate the quotation PDF.");
    },
  });

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export as Quotation PDF" size="sm">
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">

        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-surface-2)" }}
        >
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>
            Order #{order.id.slice(-8).toUpperCase()}
          </p>
          <p className="mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {order.customer_name || "Walk-in"} · {order.items.length} item(s) · LKR {order.total_amount.toFixed(2)}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Valid For (days)
          </label>
          <Input
            type="number"
            min={1}
            {...form.register("validity_days", { valueAsNumber: true })}
            error={form.formState.errors.validity_days?.message}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Notes{" "}
            <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>(optional)</span>
          </label>
          <textarea
            {...form.register("notes")}
            rows={3}
            placeholder="e.g. Prices valid for the specified period. Subject to stock availability."
            className="form-input w-full resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={mutation.isPending}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Download PDF
          </Button>
        </div>
      </form>
    </Modal>
  );
}
