import { z } from "zod";

export const creditPaymentSchema = z.object({
  patient_id:     z.string().min(1, "Customer is required"),
  sale_id:        z.string().optional(),
  amount:         z.number({ invalid_type_error: "Amount is required" }).positive("Must be greater than 0"),
  payment_method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "CHEQUE"]),
  notes:          z.string().optional(),
  branch_id:      z.string().min(1, "Branch is required"),
});

export const refundSchema = z.object({
  status:        z.enum(["REFUNDED", "PARTIAL_REFUND"]),
  refund_amount: z.number({ invalid_type_error: "Refund amount is required" }).positive("Must be greater than 0").optional(),
});

export type CreditPaymentValues = z.infer<typeof creditPaymentSchema>;
export type RefundValues        = z.infer<typeof refundSchema>;
