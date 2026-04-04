import "next-auth";
import "next-auth/jwt";
import type { UserRole } from "./index";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      fullName: string;
      role: UserRole;
      branchId: string | null;
      accessToken: string;
    };
  }

  interface User {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    branchId: string | null;
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    branchId: string | null;
    accessToken: string;
  }
}
