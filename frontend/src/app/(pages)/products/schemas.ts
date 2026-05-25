import { z } from "zod";

export const skuMappingSchema = z.object({
  sku:              z.string().min(1, "SKU name is required"),
  mapped_sku:       z.string().min(1, "Mapped SKU is required"),
  mapped_sku_count: z
    .number({ invalid_type_error: "Count must be a number" })
    .int()
    .positive("Count must be at least 1"),
  basic_sku_count: z.number().int().nonnegative().default(0),
});

export const productSchema = z.object({
  name:                  z.string().min(1, "Product name is required").max(200),
  generic_id:            z.string().min(1, "Generic is required"),
  brand_id:              z.string().min(1, "Brand is required"),
  category_id:           z.string().min(1, "Category is required"),
  basic_sku_id:          z.string().min(1, "Basic SKU is required"),
  barcode:               z.string().optional(),
  specific_instructions: z.string().optional().nullable(),
  sku_mappings:          z.array(skuMappingSchema),
  is_active:             z.boolean(),
});

export type SkuMappingFormValue = z.infer<typeof skuMappingSchema>;
export type ProductFormValues   = z.infer<typeof productSchema>;
