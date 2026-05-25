import { z } from "zod";

export const genericSchema = z.object({
  name:        z.string().min(1, "Name is required").max(200),
  description: z.string().optional(),
});

export type GenericFormValues = z.infer<typeof genericSchema>;
