import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { UserRole } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const response = await fetch(`${API_URL}/api/v1/auth/login`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              email:    credentials.email.toLowerCase().trim(),
              password: credentials.password,
            }),
          });

          if (!response.ok) return null;

          const data = await response.json();

          return {
            id:          data.user.id,
            email:       data.user.email,
            fullName:    data.user.full_name,
            role:        data.user.role as UserRole,
            branchId:    data.user.branch_id ?? null,
            accessToken: data.access_token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id          = user.id;
        token.email       = user.email!;
        token.fullName    = (user as any).fullName;
        token.role        = (user as any).role;
        token.branchId    = (user as any).branchId;
        token.accessToken = (user as any).accessToken;
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        id:          token.id as string,
        email:       token.email as string,
        fullName:    token.fullName as string,
        role:        token.role as UserRole,
        branchId:    token.branchId as string | null,
        accessToken: token.accessToken as string,
      };
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error:  "/login",
  },

  session: {
    strategy: "jwt",
    maxAge:   8 * 60 * 60,
  },

  secret: process.env.NEXTAUTH_SECRET,
};
