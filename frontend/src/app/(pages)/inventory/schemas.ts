import { z } from "zod";

export const inventoryEditSchema = z.object({
  min_stock_level: z.coerce.number().int().min(0, "Must be 0 or greater"),
});

export type InventoryEditValues = z.infer<typeof inventoryEditSchema>;
