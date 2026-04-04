"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPut } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { UserPreferences, ThemeOption } from "@/types";
import { showToast } from "@/lib/toast";

// ─── Theme option card ────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
  { value: "light",  label: "Light",  icon: <Sun     className="w-5 h-5" /> },
  { value: "dark",   label: "Dark",   icon: <Moon    className="w-5 h-5" /> },
  { value: "system", label: "System", icon: <Monitor className="w-5 h-5" /> },
];

// ─── Settings page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user: session } = useAuth();
  const { theme, setTheme } = useTheme();

  const { data: preferences } = useQuery<UserPreferences>({
    queryKey:  ["preferences"],
    queryFn:   () => apiGet<UserPreferences>("/preferences/me"),
    enabled:   !!session,
    staleTime: Infinity,
  });

  // Sync saved preference to next-themes on load
  useEffect(() => {
    if (preferences?.theme) {
      setTheme(preferences.theme);
    }
  }, [preferences, setTheme]);

  const mutation = useMutation({
    mutationFn: (selectedTheme: ThemeOption) =>
      apiPut<UserPreferences>("/preferences/me", { theme: selectedTheme }),
    onSuccess: (updated) => {
      setTheme(updated.theme);
      showToast("success", "Settings Saved", "Your appearance preference has been applied.");
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Save Failed", err?.message ?? "Something went wrong. Please try again.");
    },
  });

  const activeTheme = (theme as ThemeOption) ?? preferences?.theme ?? "system";

  return (
    <div className="page-container max-w-2xl">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle mt-1">Manage your application preferences</p>
      </div>

      {/* Appearance card */}
      <div
        className="rounded-2xl shadow-card p-6 space-y-4"
        style={{ background: "var(--color-surface)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Appearance
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Choose how PharmaOps looks to you
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const isActive = activeTheme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => mutation.mutate(opt.value)}
                disabled={mutation.isPending}
                className={cn(
                  "flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 transition-all",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                  isActive
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    : "border-transparent hover:border-[var(--color-border)]"
                )}
                style={{
                  background: isActive ? undefined : "var(--color-surface-2)",
                }}
              >
                <span style={{ color: isActive ? "var(--color-primary, #008080)" : "var(--color-text-muted)" }}>
                  {opt.icon}
                </span>
                <span
                  className={cn("text-xs font-medium", isActive && "font-semibold")}
                  style={{ color: isActive ? "var(--color-text)" : "var(--color-text-muted)" }}
                >
                  {opt.label}
                </span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end pt-1">
          <Button
            variant="primary"
            onClick={() => mutation.mutate(activeTheme)}
            isLoading={mutation.isPending}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
