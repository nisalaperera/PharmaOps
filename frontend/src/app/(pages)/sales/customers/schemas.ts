import { z } from "zod";

export const customerCreateSchema = z.object({
  full_name:     z.string().min(1, "Name is required").max(100),
  phone:         z.string().regex(/^\d{3} \d{3} \d{4}$/, "Format: ### ### ####"),
  email:         z.string().email("Invalid email").optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  address:       z.string().optional().or(z.literal("")),
  credit_limit:  z.number({ invalid_type_error: "Credit limit must be a number" }).min(0).default(0),
});

export const customerEditSchema = customerCreateSchema;

export type CustomerCreateValues = z.infer<typeof customerCreateSchema>;
export type CustomerEditValues   = z.infer<typeof customerEditSchema>;
