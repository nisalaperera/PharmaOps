import { z } from "zod";
import { entityContactSchema, payeTaxSlabSchema } from "@/app/(pages)/organization/schemas";

// ─── Branch Settings ─────────────────────────────────────────────────────────

export const branchSettingsSchema = z.object({
  currency:              z.enum(["LKR", "USD", "EUR", "GBP", "INR"]).nullable().optional(),
  logo:                  z.string().nullable().optional(),
  low_stock_threshold:   z.coerce.number().int().min(0).nullable().optional(),
  expiry_alert_days:     z.coerce.number().int().min(0).nullable().optional(),
  loyalty_points_rate:   z.coerce.number().min(0).nullable().optional(),
  tax_enabled:           z.boolean().nullable().optional(),
  is_discount_applicable: z.boolean().nullable().optional(),
  invoice_footer_text:   z.string().nullable().optional(),
  storage_conditions:    z.array(z.string()).nullable().optional(),
  special_instructions:  z.array(z.string()).nullable().optional(),
  dosage_instructions:   z.array(z.string()).nullable().optional(),
});

export const branchHRParamsSchema = z.object({
  standard_daily_hours:   z.coerce.number().min(0).nullable().optional(),
  working_days_per_month: z.coerce.number().int().min(1).max(31).nullable().optional(),
  ot_rate_multiplier:     z.coerce.number().min(1).nullable().optional(),
  epf_employee_rate:      z.coerce.number().min(0).max(100).nullable().optional(),
  epf_employer_rate:      z.coerce.number().min(0).max(100).nullable().optional(),
  etf_employer_rate:      z.coerce.number().min(0).max(100).nullable().optional(),
  paye_tax_slabs:         z.array(payeTaxSlabSchema).nullable().optional(),
});

// ─── Main Branch Form ────────────────────────────────────────────────────────

export const branchSchema = z.object({
  name:                   z.string().min(2, "Name must be at least 2 characters").max(100),
  address:                z.string().min(5, "Address is required"),
  license_number:         z.string().min(1, "License number is required"),
  branch_prefix:          z.string().max(10, "Prefix must be at most 10 characters").optional().or(z.literal("")),
  branch_manager:         z.string().nullable().optional(),
  contacts:               z.array(entityContactSchema).default([]),
  settings:               branchSettingsSchema.nullable().optional(),
  hr_params:              branchHRParamsSchema.nullable().optional(),
  is_active:              z.boolean(),
});

export type BranchFormValues = z.infer<typeof branchSchema>;
