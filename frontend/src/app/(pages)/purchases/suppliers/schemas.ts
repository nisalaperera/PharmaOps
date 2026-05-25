import { z } from "zod";

const PHONE_REGEX = /^\d{3} \d{3} \d{4}$/;
const PHONE_MSG   = "Format: ### ### ####";

// ─── Contact ──────────────────────────────────────────────────────────────────

export const contactSchema = z.object({
  id:           z.string().optional(),
  title:        z.enum(["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]),
  first_name:   z.string().min(1, "First name is required"),
  last_name:    z.string().min(1, "Last name is required"),
  landline:     z.string().regex(PHONE_REGEX, PHONE_MSG).optional().or(z.literal("")),
  mobile:       z.string().regex(PHONE_REGEX, PHONE_MSG),
  whatsapp:     z.string().regex(PHONE_REGEX, PHONE_MSG).optional().or(z.literal("")),
  contact_type: z.enum(["SALES", "DELIVERY"]),
});

// ─── Product mapping ──────────────────────────────────────────────────────────

export const productMappingSchema = z.object({
  product_id:   z.string().min(1),
  product_name: z.string().min(1),
});

// ─── Agency channel ───────────────────────────────────────────────────────────

export const agencyChannelSchema = z.object({
  id:               z.string().optional(),
  channel_name:     z.string().min(1, "Channel name is required"),
  contacts:         z.array(contactSchema).min(1, "At least one contact is required"),
  product_mappings: z.array(productMappingSchema).default([]),
});

// ─── Distributor channel ──────────────────────────────────────────────────────

export const distributorChannelSchema = z.object({
  id:                z.string().optional(),
  channel_name:      z.string().min(1, "Channel name is required"),
  channel_category:  z.enum(["AGENCY", "SUB"]),
  agency_id:         z.string().optional(),
  agency_name:       z.string().optional(),
  credit_term_days:  z.coerce.number().int().min(0, "Must be 0 or greater"),
  delivery_frequency: z.enum(["DAILY", "WEEKLY", "BI_WEEKLY", "MONTHLY", "AS_NEEDED"]),
  contacts:          z.array(contactSchema).min(1, "At least one contact is required"),
  product_mappings:  z.array(productMappingSchema).default([]),
}).refine(
  (ch) => ch.channel_category !== "AGENCY" || !!ch.agency_id,
  { message: "Agency is required when channel category is Agency", path: ["agency_id"] },
);

// ─── Supplier (basic info only — channels managed separately) ────────────────

export const supplierSchema = z.object({
  supplier_type:       z.enum(["AGENCY", "DISTRIBUTOR"]),
  short_name:          z.string().min(1, "Short name is required"),
  legal_name:          z.string().min(1, "Legal name is required"),
  registration_number: z.string().optional(),
});

// ─── Channel management (used by ChannelManagementModal) ─────────────────────

export const agencyChannelsMgmtSchema = z.object({
  agency_channels: z.array(agencyChannelSchema).default([]),
});

export const distributorChannelsMgmtSchema = z.object({
  distributor_channels: z.array(distributorChannelSchema).default([]),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type ContactValues              = z.infer<typeof contactSchema>;
export type ProductMappingValues       = z.infer<typeof productMappingSchema>;
export type AgencyChannelValues        = z.infer<typeof agencyChannelSchema>;
export type DistributorChannelValues   = z.infer<typeof distributorChannelSchema>;
export type SupplierFormValues         = z.infer<typeof supplierSchema>;
export type AgencyChannelsMgmtValues   = z.infer<typeof agencyChannelsMgmtSchema>;
export type DistributorChannelsMgmtValues = z.infer<typeof distributorChannelsMgmtSchema>;
