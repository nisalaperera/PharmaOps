import { z } from "zod";

export const grnItemSchema = z.object({
  product_id:        z.string().min(1),
  product_name:      z.string().min(1),
  ordered_quantity:  z.coerce.number().int().min(0),
  received_quantity: z.coerce.number().int().min(0, "Must be 0 or greater"),
  batch_number:      z.string().min(1, "Batch number is required"),
  expiry_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  unit_price:        z.coerce.number().min(0, "Must be 0 or greater"),
});

export const grnCreateSchema = z.object({
  purchase_order_id: z.string().min(1, "Purchase order is required"),
  branch_id:         z.string().min(1),
  supplier_id:       z.string().min(1),
  channel_id:        z.string().min(1),
  notes:             z.string().optional(),
  items:             z.array(grnItemSchema).min(1, "At least one item is required"),
});

export type GRNItemValues   = z.infer<typeof grnItemSchema>;
export type GRNCreateValues = z.infer<typeof grnCreateSchema>;
