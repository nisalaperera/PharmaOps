"use client";

import { useState, useRef, useCallback, forwardRef } from "react";
import { cn } from "@/lib/utils";

type FormatType = "amount" | "quantity" | "percentage";

interface FormattedInputProps {
  value:        number | string;
  onChange:     (value: number) => void;
  format?:     FormatType;
  label?:      string;
  error?:      string;
  helperText?: string;
  placeholder?: string;
  className?:  string;
  min?:        number;
  max?:        number;
  step?:       number;
  readOnly?:   boolean;
  disabled?:   boolean;
  required?:   boolean;
  id?:         string;
}

function formatDisplay(value: number, format: FormatType): string {
  if (value === 0) return "";
  if (format === "amount") {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (format === "quantity") {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return String(value);
}

function parseRaw(raw: string): number {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export const FormattedInput = forwardRef<HTMLInputElement, FormattedInputProps>(
  ({ value, onChange, format = "amount", label, error, helperText, placeholder, className, min, max, step, readOnly, disabled, required, id }, ref) => {
    const [focused, setFocused] = useState(false);
    const innerRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) ?? innerRef;

    const numericValue = typeof value === "string" ? parseRaw(value) : value;

    const displayValue = focused
      ? (numericValue === 0 ? "" : String(numericValue))
      : formatDisplay(numericValue, format);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "" || raw === "-" || raw === ".") {
        onChange(0);
        return;
      }
      let parsed = parseRaw(raw);
      if (format === "quantity") parsed = Math.round(parsed);
      onChange(parsed);
    }, [onChange, format]);

    const handleBlur = useCallback(() => {
      setFocused(false);
      let clamped = numericValue;
      if (min !== undefined && clamped < min) clamped = min;
      if (max !== undefined && clamped > max) clamped = max;
      if (clamped !== numericValue) onChange(clamped);
    }, [numericValue, min, max, onChange]);

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
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          step={step}
          className={cn(
            "form-input text-right tabular-nums",
            readOnly && "bg-[var(--color-surface-2)]",
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

FormattedInput.displayName = "FormattedInput";
