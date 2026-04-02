import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:      string;
  error?:      string;
  helperText?: string;
  leftIcon?:   React.ReactNode;
  rightIcon?:  React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
            {props.required && <span className="text-danger-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--color-text-muted)" }}>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "form-input",
              leftIcon  && "pl-9",
              rightIcon && "pr-9",
              error     && "border-danger-500 focus:ring-danger-500",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--color-text-muted)" }}>
              {rightIcon}
            </span>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        {!error && helperText && (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

// ─── Select ───────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?:   string;
  error?:   string;
  options:  { value: string | number; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="form-label">
            {label}
            {props.required && <span className="text-danger-500 ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "form-input",
            error && "border-danger-500 focus:ring-danger-500",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="">{placeholder}</option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

// ─── Textarea ─────────────────────────────────────────────────────────────────

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?:      string;
  error?:      string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const areaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={areaId} className="form-label">
            {label}
            {props.required && <span className="text-danger-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          className={cn(
            "form-input resize-none",
            error && "border-danger-500 focus:ring-danger-500",
            className
          )}
          rows={3}
          {...props}
        />
        {error && <p className="form-error">{error}</p>}
        {!error && helperText && (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
