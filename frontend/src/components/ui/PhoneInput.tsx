"use client";

import { forwardRef } from "react";
import { cn, formatPhoneNumber } from "@/lib/utils";

interface PhoneInputProps {
  value:        string;
  onChange:     (value: string) => void;
  onBlur?:     () => void;
  label?:      string;
  error?:      string;
  helperText?: string;
  placeholder?: string;
  className?:  string;
  required?:   boolean;
  disabled?:   boolean;
  id?:         string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, onBlur, label, error, helperText, placeholder = "077 123 4567", className, required, disabled, id }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
            {required && <span className="text-danger-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(formatPhoneNumber(e.target.value))}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={12}
          className={cn(
            "form-input",
            error && "border-danger-500 focus:ring-danger-500",
            className,
          )}
        />
        {error && <p className="form-error">{error}</p>}
        {!error && helperText && (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{helperText}</p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";
