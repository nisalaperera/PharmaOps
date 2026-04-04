import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type ButtonSize    = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   ButtonVariant;
  size?:      ButtonSize;
  isLoading?: boolean;
  leftIcon?:  React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-500 hover:bg-primary-600 text-white shadow-sm focus:ring-primary-500",
  secondary:
    "bg-navy-500 hover:bg-navy-600 text-white shadow-sm focus:ring-navy-500",
  danger:
    "bg-danger-500 hover:bg-danger-600 text-white shadow-sm focus:ring-danger-500",
  ghost:
    "bg-transparent hover:bg-[var(--color-surface-2)] text-[var(--color-text)] focus:ring-primary-500",
  outline:
    "bg-transparent border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] text-[var(--color-text)] focus:ring-primary-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm:  "px-3 py-1.5 text-xs gap-1.5",
  md:  "px-4 py-2   text-sm gap-2",
  lg:  "px-5 py-2.5 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant   = "primary",
      size      = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium",
          "transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";
