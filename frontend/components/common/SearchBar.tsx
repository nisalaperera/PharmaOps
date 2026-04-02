"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";
import { cn, debounce } from "@/lib/utils";
import { useMemo } from "react";

interface SearchBarProps {
  placeholder?: string;
  onSearch:     (value: string) => void;
  debounceMs?:  number;
  className?:   string;
  defaultValue?: string;
}

export function SearchBar({
  placeholder  = "Search…",
  onSearch,
  debounceMs   = 350,
  className,
  defaultValue = "",
}: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);

  const debouncedSearch = useMemo(
    () => debounce((v: unknown) => onSearch(v as string), debounceMs),
    [onSearch, debounceMs]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setValue(newValue);
    debouncedSearch(newValue);
  }

  function handleClear() {
    setValue("");
    onSearch("");
  }

  return (
    <div className={cn("relative", className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--color-text-muted)" }}>
        <Search className="w-4 h-4" />
      </span>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="form-input pl-9 pr-8"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-[var(--color-text)]"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
