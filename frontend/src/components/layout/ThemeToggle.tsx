"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative inline-flex items-center w-12 h-6 rounded-full transition-all duration-300",
        "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
        isDark
          ? "bg-primary-600"
          : "bg-slate-200 dark:bg-slate-700",
        className
      )}
    >
      {/* Track icons */}
      <span className="absolute left-1 top-1/2 -translate-y-1/2 transition-opacity duration-200"
            style={{ opacity: isDark ? 0 : 1 }}>
        <Sun className="w-3 h-3 text-amber-500" />
      </span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 transition-opacity duration-200"
            style={{ opacity: isDark ? 1 : 0 }}>
        <Moon className="w-3 h-3 text-slate-100" />
      </span>

      {/* Thumb */}
      <span
        className={cn(
          "w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300",
          isDark ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
