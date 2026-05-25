import { z } from "zod";

export const prescriptionItemSchema = z.object({
  product_id:   z.string().min(1, "Product is required"),
  product_name: z.string(),
  dosage:       z.string().min(1, "Dosage is required"),
  frequency:    z.string().min(1, "Frequency is required"),
  duration:     z.string().min(1, "Duration is required"),
  quantity:     z.coerce.number().int().min(1, "Minimum 1"),
});

export const prescriptionCreateSchema = z.object({
  patient_id:        z.string().min(1, "Patient is required"),
  doctor_id:         z.string().min(1, "Doctor is required"),
  branch_id:         z.string().min(1, "Branch is required"),
  prescription_date: z.string().min(1, "Prescription date is required"),
  expiry_date:       z.string().min(1, "Expiry date is required"),
  items:             z.array(prescriptionItemSchema).min(1, "At least one item is required"),
});

export type PrescriptionCreateValues = z.infer<typeof prescriptionCreateSchema>;
