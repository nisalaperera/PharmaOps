import { z } from "zod";

export const convertToInvoiceSchema = z.object({
  payment_method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "CREDIT", "CHEQUE"]),
  paid_amount:    z.coerce.number().min(0, "Must be 0 or greater"),
  invoice_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  cheque_details: z.object({
    cheque_number:  z.string().min(1, "Cheque number required"),
    bank_name:      z.string().min(1, "Bank name required"),
    clearance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  }).optional(),
});

export const exportQuotationPdfSchema = z.object({
  validity_days: z.coerce.number().int().min(1, "Must be at least 1 day"),
  notes:         z.string().optional(),
});

export type ConvertToInvoiceValues  = z.infer<typeof convertToInvoiceSchema>;
export type ExportQuotationPdfValues = z.infer<typeof exportQuotationPdfSchema>;
