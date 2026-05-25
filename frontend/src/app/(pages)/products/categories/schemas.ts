import { z } from "zod";

export const categorySchema = z.object({
  name:        z.string().min(1, "Name is required").max(200),
  description: z.string().optional(),
  parent_id:   z.string().nullable().optional(),
  is_active:   z.boolean().optional(),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
