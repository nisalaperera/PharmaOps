import { z } from "zod";

export const bankAccountCreateSchema = z.object({
  bank_name:      z.string().min(1, "Bank name is required"),
  account_number: z.string().min(1, "Account number is required"),
  account_name:   z.string().min(1, "Account name is required"),
  branch_id:      z.string().min(1, "Branch is required"),
});

export const bankAccountEditSchema = bankAccountCreateSchema.partial();

export const bankTransactionSchema = z.object({
  amount: z.number({ invalid_type_error: "Must be a number" }).positive("Amount must be greater than 0"),
  notes:  z.string().optional().or(z.literal("")),
});

export type BankAccountCreateValues = z.infer<typeof bankAccountCreateSchema>;
export type BankAccountEditValues   = z.infer<typeof bankAccountEditSchema>;
export type BankTransactionValues   = z.infer<typeof bankTransactionSchema>;
