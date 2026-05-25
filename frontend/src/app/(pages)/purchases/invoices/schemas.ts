import { z } from "zod";

export const purchaseInvoiceItemSchema = z.object({
  product_id:        z.string().min(1),
  product_name:      z.string().min(1),
  ordered_quantity:  z.coerce.number().int().min(0),
  received_quantity: z.coerce.number().int().min(0, "Must be 0 or greater"),
  batch_number:      z.string().min(1, "Batch number is required"),
  expiry_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  unit_price:        z.coerce.number().min(0, "Must be 0 or greater"),
});

export const purchaseInvoiceCreateSchema = z.object({
  purchase_order_id:    z.string().min(1, "Purchase order is required"),
  branch_id:            z.string().min(1),
  supplier_id:          z.string().min(1),
  channel_id:           z.string().min(1),
  invoice_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  supplier_invoice_ref: z.string().optional(),
  notes:                z.string().optional(),
  items:                z.array(purchaseInvoiceItemSchema).min(1, "At least one item is required"),
});

export const addPaymentSchema = z.object({
  amount:         z.coerce.number().min(0.01, "Amount must be greater than 0"),
  payment_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  payment_method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "CHEQUE"]),
});

export type PurchaseInvoiceItemValues   = z.infer<typeof purchaseInvoiceItemSchema>;
export type PurchaseInvoiceCreateValues = z.infer<typeof purchaseInvoiceCreateSchema>;
export type AddPaymentValues            = z.infer<typeof addPaymentSchema>;
