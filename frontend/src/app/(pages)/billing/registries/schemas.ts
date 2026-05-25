import { z } from "zod";

export const cashRegistryCreateSchema = z.object({
  name:                 z.string().min(1, "Name is required"),
  branch_id:            z.string().min(1, "Branch is required"),
  responsible_staff_id: z.string().optional().or(z.literal("")),
});

export const cashRegistryEditSchema = cashRegistryCreateSchema.partial();

export const openRegistrySchema = z.object({
  opening_balance: z
    .number({ invalid_type_error: "Must be a number" })
    .min(0, "Must be 0 or more")
    .default(0),
  notes: z.string().optional().or(z.literal("")),
});

export const closeRegistrySchema = z.object({
  physical_count: z
    .number({ invalid_type_error: "Must be a number" })
    .min(0, "Must be 0 or more"),
  notes: z.string().optional().or(z.literal("")),
});

export const registryTransactionSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Must be a number" })
    .positive("Amount must be greater than 0"),
  notes: z.string().optional().or(z.literal("")),
});

export type CashRegistryCreateValues  = z.infer<typeof cashRegistryCreateSchema>;
export type CashRegistryEditValues    = z.infer<typeof cashRegistryEditSchema>;
export type OpenRegistryValues        = z.infer<typeof openRegistrySchema>;
export type CloseRegistryValues       = z.infer<typeof closeRegistrySchema>;
export type RegistryTransactionValues = z.infer<typeof registryTransactionSchema>;
