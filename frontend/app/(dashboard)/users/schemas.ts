import { z } from "zod";
import { BRANCH_ROLES } from "@/lib/constants";
import type { UserRole } from "@/types";

const branchRoleRefinement = (data: { role: string; branch_id?: string }) =>
  !BRANCH_ROLES.includes(data.role as UserRole) || !!data.branch_id;

const branchRoleError = { message: "Branch is required for branch-level roles", path: ["branch_id"] };

const phoneSchema = z
  .string()
  .regex(/^\d{3} \d{3} \d{4}$/, "Phone must be in format ### ### ####")
  .or(z.literal(""))
  .optional();

export const userCreateSchema = z
  .object({
    full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
    email:     z.string().email("Enter a valid email"),
    phone:     phoneSchema,
    role:      z.enum(["ADMIN", "MANAGER", "BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"]),
    branch_id: z.string().optional(),
    password:  z.string().min(8, "Password must be at least 8 characters").or(z.literal("")),
  })
  .refine(branchRoleRefinement, branchRoleError);

export const userEditSchema = z
  .object({
    full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
    phone:     phoneSchema,
    role:      z.enum(["ADMIN", "MANAGER", "BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"]),
    branch_id: z.string().optional(),
    status:    z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  })
  .refine(branchRoleRefinement, branchRoleError);

export const passwordResetSchema = z.object({
  new_password: z.string().min(8, "Password must be at least 8 characters").or(z.literal("")),
});

export type UserCreateValues    = z.infer<typeof userCreateSchema>;
export type UserEditValues      = z.infer<typeof userEditSchema>;
export type PasswordResetValues = z.infer<typeof passwordResetSchema>;
