import { z } from "zod";

// ─── Cheque Book ──────────────────────────────────────────────────────────────

export const chequeBookCreateSchema = z
  .object({
    bank_account_id: z.string().min(1, "Bank account is required"),
    series_name:     z.string().min(1, "Series name is required").max(100),
    start_number:    z.coerce.number().int("Must be a whole number").min(1, "Must be at least 1"),
    end_number:      z.coerce.number().int("Must be a whole number").min(1, "Must be at least 1"),
    notes:           z.string().optional(),
  })
  .refine((data) => data.end_number >= data.start_number, {
    message: "End number must be ≥ start number",
    path:    ["end_number"],
  });

export type ChequeBookCreateFormValues = z.infer<typeof chequeBookCreateSchema>;

export const chequeBookEditSchema = z.object({
  series_name: z.string().min(1, "Series name is required").max(100),
  notes:       z.string().optional(),
});

export type ChequeBookEditFormValues = z.infer<typeof chequeBookEditSchema>;

// ─── Cheque Issue ─────────────────────────────────────────────────────────────

export const chequeIssueCreateSchema = z.object({
  cheque_number: z.coerce.number().int("Must be a whole number").min(1, "Cheque number is required"),
  payee:         z.string().min(1, "Payee is required").max(200),
  amount:        z.coerce.number().positive("Amount must be positive"),
  issue_date:    z
    .string()
    .min(1, "Issue date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in yyyy-MM-dd format"),
  purpose:       z.string().optional(),
  notes:         z.string().optional(),
});

export type ChequeIssueCreateFormValues = z.infer<typeof chequeIssueCreateSchema>;

// ─── Cheque Issue Status Update ───────────────────────────────────────────────

export const chequeIssueStatusUpdateSchema = z.object({
  status: z.enum(["CLEARED", "BOUNCED", "CANCELLED"]),
  notes:  z.string().optional(),
});

export type ChequeIssueStatusUpdateFormValues = z.infer<typeof chequeIssueStatusUpdateSchema>;
