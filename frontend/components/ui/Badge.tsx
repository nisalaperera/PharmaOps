import { cn } from "@/lib/utils";
import type { BadgeVariant } from "@/lib/badges";

interface BadgeProps {
  children:  React.ReactNode;
  variant?:  BadgeVariant;
  className?: string;
  dot?:       boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  danger:  "bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400",
  info:    "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400",
  outline: "bg-transparent border border-[var(--color-border)] text-[var(--color-text)]",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-slate-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger:  "bg-danger-500",
  info:    "bg-primary-500",
  outline: "bg-[var(--color-text-muted)]",
};

export function Badge({ children, variant = "default", className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold",
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dotColors[variant])} />
      )}
      {children}
    </span>
  );
}
