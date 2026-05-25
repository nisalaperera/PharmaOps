"use client";

import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InputWithSuggestionsProps {
  label?:       string;
  value:        string;
  onChange:     (value: string) => void;
  suggestions:  string[];
  placeholder?: string;
  error?:       string;
  required?:    boolean;
  disabled?:    boolean;
}

export function InputWithSuggestions({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  error,
  required,
  disabled,
}: InputWithSuggestionsProps) {
  const [isOpen,     setIsOpen]     = useState(false);
  const containerRef                = useRef<HTMLDivElement>(null);

  const showDropdown = isOpen && suggestions.length > 0;

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (showDropdown) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showDropdown]);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
      )}

      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("form-input", error && "border-danger-500 focus:ring-danger-500")}
      />

      {showDropdown && (
        <ul
          className="absolute z-50 mt-1 w-full rounded-xl border shadow-lg overflow-hidden max-h-48 overflow-y-auto py-1"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(suggestion);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface-2)] transition-colors"
                style={{ color: "var(--color-text)" }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
