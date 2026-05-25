import { z } from "zod";

const transferItemSchema = z.object({
  product_id:   z.string().min(1, "Product is required"),
  product_name: z.string().default(""),
  batch_number: z.string().min(1, "Batch number is required"),
  quantity:     z.number({ invalid_type_error: "Quantity is required" }).int().min(1, "Must be at least 1"),
});

export const stockTransferSchema = z.object({
  source_branch_id:      z.string().min(1, "Source branch is required"),
  destination_branch_id: z.string().min(1, "Destination branch is required"),
  items:                 z.array(transferItemSchema).min(1, "At least one item is required"),
  notes:                 z.string().optional().nullable(),
}).refine(
  (data) => data.source_branch_id !== data.destination_branch_id,
  { message: "Source and destination branches must be different", path: ["destination_branch_id"] }
);

export type StockTransferFormValues = z.infer<typeof stockTransferSchema>;
export type TransferItemFormValue   = z.infer<typeof transferItemSchema>;
