import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import APP_CONFIG from "@/lib/config";

export const metadata: Metadata = {
  title:       `${APP_CONFIG.appName} — ${APP_CONFIG.orgName}`,
  description: "Multi-branch pharmacy management system",
  icons: {
    icon:    APP_CONFIG.appIcon,
    apple:   APP_CONFIG.appIcon,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
