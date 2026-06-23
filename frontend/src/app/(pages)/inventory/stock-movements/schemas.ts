import { z } from "zod";

export const stockMovementItemSchema = z.object({
  product_id:     z.string().min(1, "Product is required"),
  product_name:   z.string().default(""),
  sku:            z.string().default(""),
  batch_number:   z.string().min(1, "Batch number is required"),
  expiry_date:    z.string().min(1, "Expiry date is required"),
  quantity:       z.coerce.number().int().min(1, "Must be at least 1"),
  purchase_price: z.coerce.number().min(0).default(0),
  selling_price:  z.coerce.number().min(0).default(0),
  stock_location_id:   z.string().optional().nullable(),
  stock_location_name: z.string().optional().nullable(),
  reason:         z.string().optional().nullable(),
});

export const stockMovementSchema = z.object({
  type:      z.enum(["STOCK_IN", "STOCK_OUT"]),
  branch_id: z.string().optional().nullable(),
  items:     z.array(stockMovementItemSchema).min(1, "At least one item is required"),
  notes:     z.string().optional().nullable(),
});

export type StockMovementItemFormValues = z.infer<typeof stockMovementItemSchema>;
export type StockMovementFormValues     = z.infer<typeof stockMovementSchema>;
