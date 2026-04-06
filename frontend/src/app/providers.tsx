"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, ToastBar, toast, type Toast } from "react-hot-toast";
import { CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { useState } from "react";

// ─── Theme tokens (inverse — toast is opposite of UI surface) ─────────────────

// Inverted theme tokens: bg ↔ font swapped from the UI surface colors
// Light UI → toast uses text color as bg, bg color as font
// Dark  UI → toast uses text color as bg, bg color as font
const THEME_TOKENS = {
  light: {
    background: "#0f172a",   // --color-text  (light)
    color:      "#f8fafc",   // --color-bg    (light)
    muted:      "#94a3b8",   // --color-text-muted (dark — matches dark toast bg)
    border:     "#334155",   // --color-border (dark — matches dark toast bg)
  },
  dark: {
    background: "#f1f5f9",   // --color-text  (dark)
    color:      "#0f172a",   // --color-bg    (dark)
    muted:      "#64748b",   // --color-text-muted (light — matches light toast bg)
    border:     "#e2e8f0",   // --color-border (light — matches light toast bg)
  },
};

// ─── Per-type config ──────────────────────────────────────────────────────────

const TOAST_TYPE_CONFIG = {
  success: {
    accent: "#008080",
    Icon:   CheckCircle2,
  },
  error: {
    accent: "#ED1B2E",
    Icon:   XCircle,
  },
  loading: {
    accent: "#94a3b8",
    Icon:   Loader2,
  },
} as const;

// ─── Custom toast bar ─────────────────────────────────────────────────────────

function CustomToastBar({ t, tokens }: { t: Toast; tokens: typeof THEME_TOKENS.light }) {
  const rawType = t.type === "blank" ? "success" : t.type;
  const type    = (rawType in TOAST_TYPE_CONFIG ? rawType : "success") as keyof typeof TOAST_TYPE_CONFIG;
  const config  = TOAST_TYPE_CONFIG[type];
  const { Icon } = config;

  return (
    <div
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "0.875rem",
        background:    tokens.background,
        color:         tokens.color,
        border:        `1px solid ${tokens.border}`,
        borderRadius:  "0.75rem",
        padding:       "0.875rem 0.875rem 0.875rem 1rem",
        boxShadow:     "0 20px 40px -8px rgba(0,0,0,0.35), 0 4px 12px -4px rgba(0,0,0,0.2)",
        maxWidth:      "380px",
        width:         "100%",
        pointerEvents: "auto",
      }}
    >
      {/* Solid accent icon badge */}
      <span
        style={{
          flexShrink:     0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          width:          "2.25rem",
          height:         "2.25rem",
          borderRadius:   "0.5rem",
          background:     config.accent,
          color:          "#ffffff",
        }}
      >
        <Icon
          size={18}
          strokeWidth={2.5}
          className={type === "loading" ? "animate-spin" : undefined}
        />
      </span>

      {/* Message */}
      <div
        style={{
          flex:       1,
          fontSize:   "0.875rem",
          fontWeight: 600,
          lineHeight: "1.4",
          minWidth:   0,
        }}
      >
        {typeof t.message === "function" ? t.message(t) : t.message}
      </div>

      {/* Dismiss */}
      {t.type !== "loading" && (
        <button
          onClick={() => toast.dismiss(t.id)}
          style={{
            flexShrink:     0,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            width:          "1.5rem",
            height:         "1.5rem",
            borderRadius:   "0.375rem",
            border:         "none",
            background:     "transparent",
            color:          tokens.muted,
            cursor:         "pointer",
            padding:        0,
            transition:     "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = tokens.border;
            (e.currentTarget as HTMLButtonElement).style.color      = tokens.color;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color      = tokens.muted;
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// ─── Themed toaster ───────────────────────────────────────────────────────────

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const tokens = resolvedTheme === "dark" ? THEME_TOKENS.dark : THEME_TOKENS.light;

  return (
    <Toaster position="top-right" gutter={8} toastOptions={{ duration: 4000 }}>
      {(t) => (
        <ToastBar
          toast={t}
          style={{ padding: 0, background: "transparent", boxShadow: "none", border: "none" }}
        >
          {() => <CustomToastBar t={t} tokens={tokens} />}
        </ToastBar>
      )}
    </Toaster>
  );
}

// ─── Providers ────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:            5 * 60 * 1000,
            retry:                1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          {children}
          <ThemedToaster />
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
