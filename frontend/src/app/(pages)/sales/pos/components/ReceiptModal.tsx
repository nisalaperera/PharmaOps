"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { Printer, X } from "lucide-react";
import { Modal }  from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge }  from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { PAYMENT_METHOD_VARIANT } from "@/lib/badges";
import APP_CONFIG from "@/lib/config";
import type { Sale } from "@/types";

const PAYMENT_LABEL: Record<string, string> = {
  CASH:          "Cash",
  CARD:          "Card",
  BANK_TRANSFER: "Bank Transfer",
  CREDIT:        "Credit",
  CHEQUE:        "Cheque",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED:      "Completed",
  REFUNDED:       "Refunded",
  PARTIAL_REFUND: "Partial Refund",
};

interface ReceiptModalProps {
  sale:    Sale | null;
  onClose: () => void;
}

export function ReceiptModal({ sale, onClose }: ReceiptModalProps) {
  if (!sale) return null;

  const s       = sale;
  const saleRef = format(new Date(s.created_at), "yyyy-MM-dd HH:mm");
  const shortId = s.id.slice(-8).toUpperCase();

  async function handlePrintPdf() {
    const doc  = new jsPDF();
    let cursorY = 14;

    try {
      const res     = await fetch(APP_CONFIG.orgLogo);
      const blob    = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "PNG", 14, cursorY, 12, 12);
      cursorY += 1;
    } catch { /* Logo load is non-fatal */ }

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(APP_CONFIG.orgName, 28, cursorY + 6);
    cursorY += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Receipt #${shortId}`, 14, cursorY + 4);
    doc.text(saleRef, 14, cursorY + 9);
    cursorY += 16;

    if (s.customer_name) {
      doc.setFont("helvetica", "bold");
      doc.text(`Customer: `, 14, cursorY);
      doc.setFont("helvetica", "normal");
      doc.text(s.customer_name, 36, cursorY);
      cursorY += 7;
    }

    doc.setFont("helvetica", "bold");
    doc.text("Cashier: ", 14, cursorY);
    doc.setFont("helvetica", "normal");
    doc.text(s.cashier_name, 34, cursorY);
    cursorY += 10;

    autoTable(doc, {
      startY: cursorY,
      head:   [["Product", "Batch", "Qty", "Unit Price", "Discount", "Total"]],
      body:   s.items.map((item) => [
        item.product_name,
        item.batch_number,
        item.quantity.toString(),
        item.unit_price.toFixed(2),
        item.discount > 0 ? `-${item.discount.toFixed(2)}` : "—",
        item.total_price.toFixed(2),
      ]),
      styles:      { fontSize: 8 },
      headStyles:  { fillColor: [0, 128, 128] },
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY + 30;
    cursorY = finalY + 8;

    const summaryRows = [
      ["Subtotal", s.subtotal.toFixed(2)],
      ["Discount", `-${s.discount_total.toFixed(2)}`],
      ["Total", s.total_amount.toFixed(2)],
      ["Payment", PAYMENT_LABEL[s.payment_method] ?? s.payment_method],
      ["Paid", s.paid_amount.toFixed(2)],
    ];
    if (s.payment_method === "CASH" && s.change_amount > 0) {
      summaryRows.push(["Change", s.change_amount.toFixed(2)]);
    }

    autoTable(doc, {
      startY: cursorY,
      body:   summaryRows,
      styles: { fontSize: 9, halign: "right" },
      columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
      theme: "plain",
    });

    doc.save(`receipt_${shortId}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  }

  return (
    <Modal
      isOpen={!!sale}
      onClose={onClose}
      title={`Receipt #${shortId}`}
      size="md"
      headerExtra={
        <Badge variant="success" dot>{STATUS_LABEL[sale.status] ?? sale.status}</Badge>
      }
    >
      <div className="space-y-5">

        {/* Meta */}
        <div
          className="rounded-xl px-4 py-3 space-y-1 text-sm"
          style={{ background: "var(--color-surface-2)" }}
        >
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Date</span>
            <span className="font-mono text-xs" style={{ color: "var(--color-text)" }}>{formatDateTime(sale.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Cashier</span>
            <span style={{ color: "var(--color-text)" }}>{sale.cashier_name}</span>
          </div>
          {sale.customer_name && (
            <div className="flex justify-between">
              <span style={{ color: "var(--color-text-muted)" }}>Customer</span>
              <span style={{ color: "var(--color-text)" }}>{sale.customer_name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span style={{ color: "var(--color-text-muted)" }}>Payment</span>
            <Badge variant={PAYMENT_METHOD_VARIANT[sale.payment_method] ?? "default"}>
              {PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method}
            </Badge>
          </div>
        </div>

        {/* Items table */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Items
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          </div>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-surface-2)", borderBottom: `1px solid var(--color-border)` }}>
                  <th className="text-left px-3 py-2 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Product</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Price</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="px-3 py-2">
                      <p className="font-medium" style={{ color: "var(--color-text)" }}>{item.product_name}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Batch: {item.batch_number}</p>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--color-text)" }}>{item.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                      <p>{item.unit_price.toFixed(2)}</p>
                      {item.discount > 0 && (
                        <p className="text-xs text-danger-500">-{item.discount.toFixed(2)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>
                      {item.total_price.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ background: "var(--color-surface-2)" }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-muted)" }}>Subtotal</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{sale.subtotal.toFixed(2)}</span>
          </div>
          {sale.discount_total > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Discount</span>
              <span className="tabular-nums text-danger-500">-{sale.discount_total.toFixed(2)}</span>
            </div>
          )}
          <div className="h-px" style={{ background: "var(--color-border)" }} />
          <div className="flex justify-between font-bold">
            <span style={{ color: "var(--color-text)" }}>Total</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{sale.total_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-muted)" }}>Paid</span>
            <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{sale.paid_amount.toFixed(2)}</span>
          </div>
          {sale.payment_method === "CASH" && sale.change_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Change</span>
              <span className="tabular-nums font-semibold" style={{ color: "#10b981" }}>{sale.change_amount.toFixed(2)}</span>
            </div>
          )}
          {sale.cheque_details && (
            <div className="pt-1 text-xs space-y-0.5" style={{ color: "var(--color-text-muted)" }}>
              <p>Cheque: {sale.cheque_details.cheque_number}</p>
              <p>Bank: {sale.cheque_details.bank_name} · Clears: {sale.cheque_details.clearance_date}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} leftIcon={<X className="w-4 h-4" />}>
            Close
          </Button>
          <Button variant="primary" onClick={handlePrintPdf} leftIcon={<Printer className="w-4 h-4" />}>
            Print PDF
          </Button>
        </div>

      </div>
    </Modal>
  );
}
