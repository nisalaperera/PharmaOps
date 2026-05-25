import { z } from "zod";

export const brandSchema = z.object({
  name:              z.string().min(1, "Name is required").max(200),
  manufacturer_name: z.string().optional(),
});

export type BrandFormValues = z.infer<typeof brandSchema>;
