import { z } from "zod";

const phoneSchema = z
  .string()
  .regex(/^\d{3} \d{3} \d{4}$/, "Format: ### ### ####");

const optionalPhoneSchema = z
  .string()
  .regex(/^\d{3} \d{3} \d{4}$/, "Format: ### ### ####")
  .or(z.literal(""))
  .optional();

export const staffCreateSchema = z.object({
  branch_id:        z.string().min(1, "Branch is required"),
  title:            z.string().optional(),
  first_name:       z.string().min(1, "First name is required").max(50),
  last_name:        z.string().min(1, "Last name is required").max(50),
  mobile_1:         phoneSchema,
  mobile_2:         optionalPhoneSchema,
  landline:         optionalPhoneSchema,
  whatsapp_number:  optionalPhoneSchema,
  email:            z.string().email("Enter a valid email").or(z.literal("")).optional(),
  epf_no:           z.string().optional(),
  id_number:        z.string().optional(),
  address:          z.string().optional(),
  role:             z.string().min(1, "Job title is required"),
  is_active:        z.boolean().default(true),
});

export const staffEditSchema = z.object({
  title:            z.string().optional(),
  first_name:       z.string().min(1, "First name is required").max(50),
  last_name:        z.string().min(1, "Last name is required").max(50),
  mobile_1:         phoneSchema,
  mobile_2:         optionalPhoneSchema,
  landline:         optionalPhoneSchema,
  whatsapp_number:  optionalPhoneSchema,
  email:            z.string().email("Enter a valid email").or(z.literal("")).optional(),
  epf_no:           z.string().optional(),
  id_number:        z.string().optional(),
  address:          z.string().optional(),
  role:             z.string().min(1, "Job title is required"),
  is_active:        z.boolean(),
});

export type StaffCreateValues = z.infer<typeof staffCreateSchema>;
export type StaffEditValues   = z.infer<typeof staffEditSchema>;
