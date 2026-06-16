import { z } from "zod";

export const deductionSchema = z.object({
  type:        z.enum(["TAX", "EPF", "ETF", "LOAN", "OTHER"]),
  description: z.string().optional(),
  amount:      z.coerce.number().min(0, "Must be 0 or greater"),
});

export const payrollCreateSchema = z.object({
  staff_id:   z.string().min(1, "Staff member is required"),
  branch_id:  z.string().min(1, "Branch is required"),
  month:      z.coerce.number().int().min(1).max(12),
  year:       z.coerce.number().int().min(2020),
  deductions: z.array(deductionSchema).default([]),
});

export const payrollPaySchema = z.object({
  source_type: z.enum(["CASH_REGISTRY", "BANK_ACCOUNT"]),
  source_id:   z.string().min(1, "Payment source is required"),
  notes:       z.string().optional(),
});

export type DeductionValues     = z.infer<typeof deductionSchema>;
export type PayrollCreateValues = z.infer<typeof payrollCreateSchema>;
export type PayrollPayValues    = z.infer<typeof payrollPaySchema>;
