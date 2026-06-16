import { z } from "zod";

export const poItemSchema = z.object({
  product_id:    z.string().min(1, "Product is required"),
  product_name:  z.string().min(1),
  sku:           z.string().default(""),
  unit_quantity: z.coerce.number().int().min(1, "Must be at least 1"),
  free_quantity: z.coerce.number().int().min(0).default(0),
  discount:      z.coerce.number().min(0).default(0),
  unit_price:    z.coerce.number().min(0, "Must be 0 or greater"),
  line_total:    z.coerce.number().default(0),
});

export const poReturnItemSchema = z.object({
  product_id:    z.string().min(1, "Product is required"),
  product_name:  z.string().min(1),
  sku:           z.string().default(""),
  unit_quantity: z.coerce.number().int().min(1, "Must be at least 1"),
  free_quantity: z.coerce.number().int().min(0).default(0),
  unit_price:    z.coerce.number().min(0, "Must be 0 or greater"),
  line_total:    z.coerce.number().default(0),
});

export const poCreateSchema = z.object({
  branch_id:    z.string().min(1, "Branch is required"),
  supplier_id:  z.string().min(1, "Supplier is required"),
  channel_id:   z.string().min(1, "Channel is required"),
  order_date:   z.string().min(1, "Order date is required"),
  notes:        z.string().optional(),
  items:        z.array(poItemSchema).min(1, "At least one item is required"),
  return_items: z.array(poReturnItemSchema).default([]),
});

export const poEditSchema = poCreateSchema;

export type POItemValues        = z.infer<typeof poItemSchema>;
export type POReturnItemValues  = z.infer<typeof poReturnItemSchema>;
export type POCreateValues      = z.infer<typeof poCreateSchema>;
export type POEditValues        = z.infer<typeof poEditSchema>;
