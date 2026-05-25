import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import "./globals.css";
import { Providers } from "./providers";
import { authOptions } from "@/lib/auth-options";
import APP_CONFIG from "@/lib/config";

const inter = Inter({
  subsets:  ["latin"],
  display:  "swap",
  weight:   ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title:       `${APP_CONFIG.appName} — ${APP_CONFIG.orgName}`,
  description: "Multi-branch pharmacy management system",
  icons: {
    icon:  APP_CONFIG.appIcon,
    apple: APP_CONFIG.appIcon,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pre-populate the session from the server so SessionProvider on the client
  // starts as "authenticated" immediately — no /api/auth/session round-trip.
  const session = await getServerSession(authOptions);

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
