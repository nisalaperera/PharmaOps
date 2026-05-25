"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AutocompleteOption {
  value: string;
  label: string;
}

interface AutocompleteProps {
  label?:       React.ReactNode;
  options:      AutocompleteOption[];
  value:        string;
  onChange:     (value: string) => void;
  onCreateNew?: (inputValue: string) => void;
  placeholder?: string;
  error?:       string;
  required?:    boolean;
  isLoading?:   boolean;
  className?:   string;
}

export function Autocomplete({
  label,
  options,
  value,
  onChange,
  onCreateNew,
  placeholder = "Search or select…",
  error,
  required,
  isLoading,
  className,
}: AutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen,     setIsOpen]     = useState(false);
  const containerRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const found = options.find((o) => o.value === value);
    setInputValue(found?.label ?? "");
  }, [value, options]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        const found = options.find((o) => o.value === value);
        setInputValue(found?.label ?? "");
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen, value, options]);

  const filtered = inputValue
    ? options.filter((o) => o.label.toLowerCase().includes(inputValue.toLowerCase()))
    : options;

  const showCreate = onCreateNew && inputValue.trim().length > 0;

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setIsOpen(true);
    if (value) onChange("");
  }

  function handleSelect(option: AutocompleteOption) {
    onChange(option.value);
    setInputValue(option.label);
    setIsOpen(false);
  }

  function handleCreateNew() {
    if (onCreateNew) onCreateNew(inputValue.trim());
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="text-danger-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={isLoading ? "Loading…" : placeholder}
          disabled={isLoading}
          className={cn(
            "form-input pr-8",
            error && "border-danger-500 focus:ring-danger-500"
          )}
        />
        <ChevronDown
          className={cn(
            "absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-transform",
            isOpen && "rotate-180"
          )}
          style={{ color: "var(--color-text-muted)" }}
        />
      </div>

      {isOpen && (
        <div
          className="absolute z-50 mt-1 w-full rounded-xl border shadow-lg overflow-hidden"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length > 0 ? (
              filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                    className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-[var(--color-surface-2)] transition-colors"
                    style={{ color: "var(--color-text)" }}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === value && (
                      <Check className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                    )}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                No results
              </li>
            )}
          </ul>

          {showCreate && (
            <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleCreateNew(); }}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[var(--color-surface-2)] transition-colors text-primary-500"
              >
                <Plus className="w-3.5 h-3.5" />
                Create &quot;{inputValue.trim()}&quot;
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
