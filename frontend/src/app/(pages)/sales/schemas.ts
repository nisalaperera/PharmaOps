import { z } from "zod";

export const saleRefundSchema = z
  .object({
    status:        z.enum(["REFUNDED", "PARTIAL_REFUND"]),
    refund_amount: z.coerce.number().positive("Refund amount must be positive").optional(),
  })
  .refine(
    (data) =>
      data.status !== "PARTIAL_REFUND" ||
      (data.refund_amount !== undefined && data.refund_amount > 0),
    { message: "Refund amount is required for a partial refund", path: ["refund_amount"] },
  );

export type SaleRefundFormValues = z.infer<typeof saleRefundSchema>;
