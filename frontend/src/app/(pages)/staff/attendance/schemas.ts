import { z } from "zod";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Accepts an empty string (cleared input) or a valid HH:MM time. */
const optionalTimeField = z
  .string()
  .refine((v) => v === "" || TIME_REGEX.test(v), "Must be a valid time")
  .optional();

/** Cross-field rule: clock_out requires clock_in; clock_out must be after clock_in. */
function refineClockInOut(
  data: { clock_in?: string; clock_out?: string },
  ctx:  z.RefinementCtx,
) {
  const clockIn  = data.clock_in  ?? "";
  const clockOut = data.clock_out ?? "";

  if (clockOut && !clockIn) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      message: "Clock In is required when Clock Out is set",
      path:    ["clock_in"],
    });
    return;
  }

  if (clockIn && clockOut) {
    const [inH,  inM]  = clockIn.split(":").map(Number);
    const [outH, outM] = clockOut.split(":").map(Number);
    if ((outH * 60 + outM) <= (inH * 60 + inM)) {
      ctx.addIssue({
        code:    z.ZodIssueCode.custom,
        message: "Clock Out must be after Clock In",
        path:    ["clock_out"],
      });
    }
  }
}

export const attendanceCreateSchema = z
  .object({
    staff_id:  z.string().min(1, "Staff member is required"),
    branch_id: z.string().min(1, "Branch is required"),
    date:      z.string().min(1, "Date is required"),
    clock_in:  optionalTimeField,
    clock_out: optionalTimeField,
    notes:     z.string().optional(),
  })
  .superRefine(refineClockInOut);

export const attendanceEditSchema = z
  .object({
    clock_in:  optionalTimeField,
    clock_out: optionalTimeField,
    notes:     z.string().optional(),
  })
  .superRefine(refineClockInOut);

export type AttendanceCreateValues = z.infer<typeof attendanceCreateSchema>;
export type AttendanceEditValues   = z.infer<typeof attendanceEditSchema>;
