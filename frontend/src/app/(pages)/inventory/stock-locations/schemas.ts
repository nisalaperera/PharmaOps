import { z } from "zod";

export const stockLocationSchema = z.object({
  name:        z.string().min(1, "Name is required").max(100),
  code:        z.string().min(1, "Code is required").max(20),
  description: z.string().optional(),
  is_active:   z.boolean(),
});

export type StockLocationFormValues = z.infer<typeof stockLocationSchema>;
