import { z } from "zod";

export const fundTransferSchema = z.object({
  from_source_type: z.enum(["CASH_REGISTRY", "BANK_ACCOUNT"]),
  from_source_id:   z.string().min(1, "Source is required"),
  to_source_type:   z.enum(["CASH_REGISTRY", "BANK_ACCOUNT"]),
  to_source_id:     z.string().min(1, "Destination is required"),
  amount:           z.number({ invalid_type_error: "Must be a number" }).positive("Amount must be greater than 0"),
  notes:            z.string().optional().or(z.literal("")),
  transfer_date:    z.string().min(1, "Date is required"),
}).refine(
  (data) => !(data.from_source_type === data.to_source_type && data.from_source_id === data.to_source_id),
  { message: "Source and destination cannot be the same", path: ["to_source_id"] }
);

export type FundTransferValues = z.infer<typeof fundTransferSchema>;
