import { z } from "zod";

export const skuSchema = z.object({
  name:      z.string().min(1, "Name is required").max(100),
  plural:    z.string().max(100).optional().nullable(),
  sku_type:  z.enum(["COUNT", "VOLUME", "WEIGHT", "LENGTH"], {
    errorMap: () => ({ message: "SKU type is required" }),
  }),
  is_active: z.boolean(),
});

export type SkuFormValues = z.infer<typeof skuSchema>;
