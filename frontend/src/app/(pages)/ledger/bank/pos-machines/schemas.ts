import { z } from "zod";

export const posMachineSchema = z.object({
  bank_account_id: z.string().min(1, "Bank account is required"),
  terminal_id:     z.string().min(1, "Terminal ID is required"),
  merchant_id:     z.string().optional(),
  notes:           z.string().optional(),
});

export const posMachineUpdateSchema = z.object({
  terminal_id: z.string().min(1, "Terminal ID is required"),
  merchant_id: z.string().optional(),
  notes:       z.string().optional(),
});

export const posTransactionSchema = z.object({
  amount:           z.coerce.number().gt(0, "Amount must be greater than 0"),
  card_type:        z.enum(["VISA", "MASTERCARD", "AMEX", "OTHER"]),
  reference_number: z.string().optional(),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  notes:            z.string().optional(),
});

export const posSettleSchema = z.object({
  settlement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: yyyy-MM-dd"),
  notes:           z.string().optional(),
});

export type PosMachineValues       = z.infer<typeof posMachineSchema>;
export type PosMachineUpdateValues = z.infer<typeof posMachineUpdateSchema>;
export type PosTransactionValues   = z.infer<typeof posTransactionSchema>;
export type PosSettleValues        = z.infer<typeof posSettleSchema>;
