import { z } from "zod";

export const branchSchema = z.object({
  name:           z.string().min(2, "Name must be at least 2 characters").max(100),
  code:           z.string().min(2, "Code must be at least 2 characters").max(10, "Code must be at most 10 characters"),
  address:        z.string().min(5, "Address is required"),
  phone:          z.string().regex(/^\d{3} \d{3} \d{4}$/, "Phone must be in format ### ### ####"),
  license_number: z.string().min(1, "License number is required"),
  is_active:      z.boolean(),
});

export type BranchFormValues = z.infer<typeof branchSchema>;
