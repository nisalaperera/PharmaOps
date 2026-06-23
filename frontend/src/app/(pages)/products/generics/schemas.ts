import { z } from "zod";

export const genericSchema = z.object({
  name:                          z.string().min(1, "Name is required").max(200),
  description:                   z.string().optional().nullable(),
  dosage_form:                   z.string().optional().nullable(),
  requires_prescription:         z.boolean(),
  controlled_substance_schedule: z.string().optional().nullable(),
  active_ingredients:            z.array(z.string()).default([]),
  side_effects:                  z.array(z.string()).default([]),
  drug_interactions:             z.array(z.string()).default([]),
  local_license_number:          z.string().optional().nullable(),
  storage_conditions:            z.array(z.string()).default([]),
  special_instructions:          z.array(z.string()).default([]),
  dosage_instructions:           z.array(z.string()).default([]),
  stock_location_id:             z.string().optional().nullable(),
});

export type GenericFormValues = z.infer<typeof genericSchema>;
