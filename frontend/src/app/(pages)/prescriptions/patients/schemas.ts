import { z } from "zod";

export const patientCreateSchema = z.object({
  customer_id:   z.string().min(1, "Customer is required"),
  name:          z.string().min(1, "Name is required").max(100),
  relationship:  z.enum(["SELF", "SPOUSE", "CHILD", "PARENT", "SIBLING", "OTHER"]),
  date_of_birth: z.string().optional().or(z.literal("")),
});

export const patientEditSchema = patientCreateSchema;

export type PatientCreateValues = z.infer<typeof patientCreateSchema>;
export type PatientEditValues   = z.infer<typeof patientEditSchema>;
