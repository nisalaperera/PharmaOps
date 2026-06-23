import { z } from "zod";

const PHONE_REGEX = /^\d{3} \d{3} \d{4}$/;
const PHONE_MSG   = "Phone must be in format ### ### ####";

// ─── Entity Contact (shared by Chain & Branch) ───────────────────────────────

export const entityContactSchema = z.object({
  id:         z.string().optional(),
  identifier: z.string().min(1, "Label is required").max(100),
  title:      z.enum(["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]),
  first_name: z.string().min(1, "First name is required").max(100),
  last_name:  z.string().min(1, "Last name is required").max(100),
  mobile_1:   z.string().regex(PHONE_REGEX, PHONE_MSG),
  mobile_2:   z.string().regex(PHONE_REGEX, PHONE_MSG).optional().or(z.literal("")),
  whatsapp:   z.string().regex(PHONE_REGEX, PHONE_MSG).optional().or(z.literal("")),
  landline:   z.string().regex(PHONE_REGEX, PHONE_MSG).optional().or(z.literal("")),
  email:      z.string().email("Invalid email").optional().or(z.literal("")),
  is_active:  z.boolean().default(true),
});

export type EntityContactFormValues = z.infer<typeof entityContactSchema>;

// ─── PAYE Tax Slab ───────────────────────────────────────────────────────────

export const payeTaxSlabSchema = z.object({
  min_amount:   z.coerce.number().min(0, "Must be 0 or greater"),
  max_amount:   z.coerce.number().min(0).nullable().optional(),
  rate_percent: z.coerce.number().min(0).max(100, "Max 100%"),
  fixed_amount: z.coerce.number().min(0, "Must be 0 or greater").default(0),
});

export type PayeTaxSlabFormValues = z.infer<typeof payeTaxSlabSchema>;

// ─── Chain General ───────────────────────────────────────────────────────────

export const chainGeneralSchema = z.object({
  name:         z.string().min(2, "Name must be at least 2 characters").max(200),
  chain_prefix: z.string().min(1, "Prefix is required").max(10),
});

export type ChainGeneralFormValues = z.infer<typeof chainGeneralSchema>;

// ─── Chain Settings ──────────────────────────────────────────────────────────

export const chainSettingsSchema = z.object({
  default_currency:       z.enum(["LKR", "USD", "EUR", "GBP", "INR"]),
  low_stock_threshold:    z.coerce.number().int().min(0),
  expiry_alert_days:      z.coerce.number().int().min(0),
  loyalty_points_rate:    z.coerce.number().min(0).nullable().optional(),
  tax_enabled:            z.boolean(),
  is_discount_applicable: z.boolean(),
  invoice_footer_text:    z.string().optional().or(z.literal("")),
  storage_conditions:     z.array(z.string()).default([]),
  special_instructions:   z.array(z.string()).default([]),
  dosage_instructions:    z.array(z.string()).default([]),
});

export type ChainSettingsFormValues = z.infer<typeof chainSettingsSchema>;

// ─── Chain HR Params ─────────────────────────────────────────────────────────

export const chainHRParamsSchema = z.object({
  standard_daily_hours:   z.coerce.number().min(0),
  working_days_per_month: z.coerce.number().int().min(1).max(31),
  ot_rate_multiplier:     z.coerce.number().min(1),
  epf_employee_rate:      z.coerce.number().min(0).max(100),
  epf_employer_rate:      z.coerce.number().min(0).max(100),
  etf_employer_rate:      z.coerce.number().min(0).max(100),
  paye_tax_slabs:         z.array(payeTaxSlabSchema).default([]),
});

export type ChainHRParamsFormValues = z.infer<typeof chainHRParamsSchema>;
