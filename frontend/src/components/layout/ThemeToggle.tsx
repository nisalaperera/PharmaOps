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
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative inline-flex items-center w-14 h-7 rounded-full transition-colors duration-300",
        "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
        isDark ? "bg-slate-700" : "bg-amber-100",
        className
      )}
    >
      {/* Sun icon — left side, visible in light mode */}
      <Sun
        className="absolute left-1.5 w-4 h-4 text-amber-500 transition-opacity duration-200"
        style={{ opacity: isDark ? 0.3 : 1 }}
      />

      {/* Moon icon — right side, visible in dark mode */}
      <Moon
        className="absolute right-1.5 w-4 h-4 text-slate-400 transition-opacity duration-200"
        style={{ opacity: isDark ? 1 : 0.3 }}
      />

      {/* Sliding thumb */}
      <span
        className={cn(
          "absolute flex items-center justify-center w-5 h-5 rounded-full shadow-md transition-all duration-300",
          isDark
            ? "translate-x-[34px] bg-slate-900"
            : "translate-x-[2px] bg-white"
        )}
      >
        {isDark
          ? <Moon className="w-3 h-3 text-primary-400" />
          : <Sun  className="w-3 h-3 text-amber-500" />
        }
      </span>
    </button>
  );
}
