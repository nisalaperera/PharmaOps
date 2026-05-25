import { z } from "zod";

export const poItemSchema = z.object({
  product_id:   z.string().min(1, "Product is required"),
  product_name: z.string().min(1),
  quantity:     z.coerce.number().int().min(1, "Must be at least 1"),
  unit_price:   z.coerce.number().min(0, "Must be 0 or greater"),
  total_price:  z.coerce.number(),
});

export const poCreateSchema = z.object({
  branch_id:   z.string().min(1, "Branch is required"),
  supplier_id: z.string().min(1, "Supplier is required"),
  channel_id:  z.string().min(1, "Channel is required"),
  notes:       z.string().optional(),
  items:       z.array(poItemSchema).min(1, "At least one item is required"),
});

export const poEditSchema = poCreateSchema;

export type POItemValues   = z.infer<typeof poItemSchema>;
export type POCreateValues = z.infer<typeof poCreateSchema>;
export type POEditValues   = z.infer<typeof poEditSchema>;
