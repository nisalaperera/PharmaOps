import { z } from "zod";

export const categorySchema = z.object({
  name:                       z.string().min(1, "Name is required").max(200),
  parent_id:                  z.string().nullable().optional(),
  is_discount_applicable:     z.boolean().default(false),
  default_margin_percentage:  z.number().min(0).max(999).nullable().optional(),
  icon:                       z.string().optional().nullable(),
  colour:                     z.string().optional().nullable(),
  is_active:                  z.boolean().optional(),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
