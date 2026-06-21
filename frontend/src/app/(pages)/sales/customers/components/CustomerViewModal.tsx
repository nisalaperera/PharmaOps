"use client";

import { useQuery } from "@tanstack/react-query";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge }  from "@/components/ui/Badge";
import { X, Pencil } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { formatDateTime, formatAmount } from "@/lib/utils";
import { getActiveStatusVariant } from "@/lib/badges";
import type { Customer, CustomerLedger } from "@/types";

interface CustomerViewModalProps {
  customer: Customer | null;
  isOpen:   boolean;
  onClose:  () => void;
  onEdit:   () => void;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{value ?? "—"}</p>
    </div>
  );
}

export function CustomerViewModal({ customer, isOpen, onClose, onEdit }: CustomerViewModalProps) {
  const { data: ledger } = useQuery<CustomerLedger>({
    queryKey: ["customer-ledger", customer?.id],
    queryFn:  () => apiGet<CustomerLedger>(`/customers/${customer!.id}/ledger`),
    enabled:  isOpen && !!customer,
  });

  if (!customer) return null;

  const initials = customer.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customer Details"
      size="md"
      headerExtra={
        <Badge variant={getActiveStatusVariant(customer.is_active)} dot>
          {customer.is_active ? "Active" : "Inactive"}
        </Badge>
      }
    >
      <div className="space-y-5">

        {/* Identity card */}
        <div className="flex items-center gap-4 rounded-xl px-4 py-3" style={{ background: "var(--color-surface-2)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-lg"
               style={{ background: "var(--color-primary)" }}>
            {initials}
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>{customer.full_name}</p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{customer.phone}</p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Email"         value={customer.email} />
          <Field label="Date of Birth" value={customer.date_of_birth} />
          <Field label="Credit Limit"  value={formatAmount(customer.credit_limit)} />
          <Field label="Outstanding"   value={formatAmount(customer.outstanding_balance)} />
          {customer.address && <div className="col-span-2"><Field label="Address" value={customer.address} /></div>}
        </div>

        {/* Credit ledger */}
        {ledger && ledger.entries.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>Credit Ledger</p>
            <div className="rounded-xl divide-y max-h-48 overflow-y-auto" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
              {ledger.entries.map((entry) => (
                <div key={`${entry.entry_type}-${entry.id}`} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {entry.entry_type === "CREDIT_SALE" ? (
                        <Badge variant={entry.settled ? "success" : "danger"}>
                          {entry.settled ? "Settled" : "Credit Sale"}
                        </Badge>
                      ) : (
                        <Badge variant="info">Payment</Badge>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {entry.created_at ? formatDateTime(entry.created_at) : "—"}
                    </p>
                  </div>
                  <span
                    className="text-sm font-semibold tabular-nums ml-4"
                    style={{ color: entry.entry_type === "PAYMENT" ? "var(--color-success, #059669)" : "var(--color-text)" }}
                  >
                    {entry.entry_type === "PAYMENT" ? "-" : "+"}{formatAmount(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit */}
        <div className="border-t pt-3 grid grid-cols-2 gap-3 text-xs" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
          <div><span className="font-medium">Created: </span>{formatDateTime(customer.created_at)}{customer.created_by_name && ` by ${customer.created_by_name}`}</div>
          <div><span className="font-medium">Updated: </span>{formatDateTime(customer.updated_at)}{customer.updated_by_name && ` by ${customer.updated_by_name}`}</div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} leftIcon={<X className="w-4 h-4" />}>Close</Button>
          <Button variant="primary" onClick={onEdit} leftIcon={<Pencil className="w-4 h-4" />}>Edit</Button>
        </div>

      </div>
    </Modal>
  );
}
