import { z } from "zod";

export const purchaseInvoiceItemSchema = z.object({
  product_id:    z.string().min(1, "Product is required"),
  product_name:  z.string().default(""),
  sku:           z.string().default(""),
  batch_number:  z.string().min(1, "Batch No is required"),
  expiry_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  unit_quantity: z.coerce.number().int().min(1, "Min 1"),
  free_quantity: z.coerce.number().int().min(0).default(0),
  discount:      z.coerce.number().min(0).max(100, "Discount is a percentage (0-100)").default(0),
  unit_price:    z.coerce.number().min(0, "Must be 0 or greater"),
  selling_price: z.coerce.number().min(0).default(0),
});

export const purchaseReturnItemSchema = z.object({
  product_id:   z.string().min(1, "Product is required"),
  product_name: z.string().default(""),
  batch_number: z.string().default(""),
  quantity:     z.coerce.number().int().min(1, "Min 1"),
  unit_price:   z.coerce.number().min(0, "Must be 0 or greater"),
});

export const purchaseInvoiceSchema = z
  .object({
    branch_id:                z.string().min(1, "Branch is required"),
    supplier_id:              z.string().min(1, "Distributor is required"),
    channel_id:               z.string().min(1, "Channel is required"),
    invoice_date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
    purchase_order_id:        z.string().optional().nullable(),
    distributor_invoice_no:   z.string().optional().nullable(),
    distributor_invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd").optional().or(z.literal("")).nullable(),
    status:                   z.enum(["DRAFT", "RECEIVED", "PARTIALLY_VERIFIED", "VERIFIED"]),
    items:                    z.array(purchaseInvoiceItemSchema).default([]),
    return_items:             z.array(purchaseReturnItemSchema).default([]),
    manual_total_amount:      z.coerce.number().min(0).optional().nullable(),
    manual_return_amount:     z.coerce.number().min(0).optional().nullable(),
    notes:                    z.string().optional(),
  })
  .refine((v) => v.items.length > 0 || (v.manual_total_amount ?? 0) >= 0, {
    message: "Enter a total amount or add at least one item",
    path:    ["manual_total_amount"],
  });

export const CHEQUE_STATUS_OPTIONS = [
  { value: "DRAFTED",  label: "Drafted"  },
  { value: "ISSUED",   label: "Issued"   },
  { value: "CLEARED",  label: "Cleared"  },
  { value: "RETURNED", label: "Returned" },
] as const;

export const purchasePaymentSchema = z
  .object({
    payment_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
    payment_method:   z.enum(["CASH", "CHEQUE", "BANK_TRANSFER"]),
    cash_register_id: z.string().optional(),
    bank_account_id:  z.string().optional(),
    cheque_book_id:   z.string().optional(),
    cheque_number:    z.string().optional(),
    cheque_due_date:  z.string().optional(),
    cheque_status:    z.enum(["DRAFTED", "ISSUED", "CLEARED", "RETURNED"]).default("ISSUED"),
    reference:        z.string().optional(),
    allocations: z
      .array(z.object({ invoice_id: z.string().min(1), amount: z.coerce.number().min(0) }))
      .min(1, "Select at least one invoice"),
  })
  .superRefine((v, ctx) => {
    if (v.payment_method === "CASH" && !v.cash_register_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cash register is required", path: ["cash_register_id"] });
    }
    if (v.payment_method === "BANK_TRANSFER" && !v.bank_account_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bank account is required", path: ["bank_account_id"] });
    }
    if (v.payment_method === "BANK_TRANSFER" && !v.reference?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Reference is required for bank transfers", path: ["reference"] });
    }
    if (v.payment_method === "CHEQUE" && !v.cheque_book_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cheque book is required", path: ["cheque_book_id"] });
    }
    if (v.payment_method === "CHEQUE" && !v.cheque_number?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cheque number is required", path: ["cheque_number"] });
    }
    if (v.payment_method === "CHEQUE" && !v.cheque_due_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cheque due date is required", path: ["cheque_due_date"] });
    }
  });

export type PurchaseInvoiceItemValues = z.infer<typeof purchaseInvoiceItemSchema>;
export type PurchaseReturnItemValues  = z.infer<typeof purchaseReturnItemSchema>;
export type PurchaseInvoiceValues      = z.infer<typeof purchaseInvoiceSchema>;
export type PurchasePaymentValues      = z.infer<typeof purchasePaymentSchema>;
