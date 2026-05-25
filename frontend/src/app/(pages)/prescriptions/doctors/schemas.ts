import { z } from "zod";

export const doctorCreateSchema = z.object({
  name:               z.string().min(1, "Name is required").max(100),
  specialization:     z.string().min(1, "Specialization is required"),
  hospital_or_clinic: z.string().min(1, "Hospital / Clinic is required"),
  license_number:     z.string().min(1, "License number is required"),
  phone:              z.string().regex(/^\d{3} \d{3} \d{4}$/, "Format: ### ### ####"),
});

export const doctorEditSchema = doctorCreateSchema;

export type DoctorCreateValues = z.infer<typeof doctorCreateSchema>;
export type DoctorEditValues   = z.infer<typeof doctorEditSchema>;
