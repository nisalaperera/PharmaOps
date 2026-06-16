import { z } from "zod";

export const purchaseInvoiceItemSchema = z.object({
  product_id:    z.string().min(1, "Product is required"),
  product_name:  z.string().default(""),
  sku:           z.string().default(""),
  batch_number:  z.string().min(1, "Batch No is required"),
  expiry_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  unit_quantity: z.coerce.number().int().min(1, "Min 1"),
  free_quantity: z.coerce.number().int().min(0).default(0),
  discount:      z.coerce.number().min(0).default(0),
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
    status:                   z.enum(["DRAFT", "RECEIVED", "VERIFIED"]),
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

export const purchasePaymentSchema = z.object({
  payment_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  payment_method: z.enum(["CASH", "CHEQUE", "BANK_TRANSFER"]),
  reference:      z.string().optional(),
  allocations: z
    .array(
      z.object({
        invoice_id: z.string().min(1),
        amount:     z.coerce.number().min(0),
      }),
    )
    .min(1, "Select at least one invoice"),
});

export type PurchaseInvoiceItemValues = z.infer<typeof purchaseInvoiceItemSchema>;
export type PurchaseReturnItemValues  = z.infer<typeof purchaseReturnItemSchema>;
export type PurchaseInvoiceValues      = z.infer<typeof purchaseInvoiceSchema>;
export type PurchasePaymentValues      = z.infer<typeof purchasePaymentSchema>;
