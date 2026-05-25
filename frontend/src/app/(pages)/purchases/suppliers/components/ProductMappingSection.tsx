"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useFieldArray } from "react-hook-form";
import type { Control } from "react-hook-form";
import { X, Search } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type { Product, PaginatedResponse } from "@/types";

type ChannelPath =
  | `agency_channels.${number}`
  | `distributor_channels.${number}`;

interface ProductMappingSectionProps {
  channelPath: ChannelPath;
  control:     Control<any>;
}

export function ProductMappingSection({ channelPath, control }: ProductMappingSectionProps) {
  const mappingsPath = `${channelPath}.product_mappings` as const;

  const { fields, append, remove } = useFieldArray({
    control,
    name:    mappingsPath as any,
    keyName: "rhfKey",
  });

  const [searchTerm,   setSearchTerm]   = useState("");
  const [results,      setResults]      = useState<Product[]>([]);
  const [isOpen,       setIsOpen]       = useState(false);
  const [isSearching,  setIsSearching]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedIds = new Set((fields as any[]).map((f: any) => f.product_id));

  const search = useCallback(async (term: string) => {
    if (!term.trim()) { setResults([]); setIsOpen(false); return; }
    setIsSearching(true);
    try {
      const data = await apiGet<PaginatedResponse<Product>>("/products", {
        search: term, page: 1, page_size: 10, is_active: "true",
      });
      setResults(data.data.filter((p) => !selectedIds.has(p.id)));
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(searchTerm), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function addProduct(product: Product) {
    append({ product_id: product.id, product_name: product.name } as any);
    setSearchTerm("");
    setResults([]);
    setIsOpen(false);
  }

  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: "var(--color-text-muted)" }}>
        Product Mappings
      </span>

      {/* Selected products */}
      {fields.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(fields as any[]).map((field: any, index: number) => (
            <span
              key={field.rhfKey}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{
                background:   "var(--color-surface-2)",
                borderColor:  "var(--color-border)",
                color:        "var(--color-text)",
              }}
            >
              {field.product_name}
              <button
                type="button"
                onClick={() => remove(index)}
                className="ml-0.5 rounded-full transition-colors text-danger-400 hover:text-danger-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search and add products…"
            className="form-input pl-8 text-sm w-full"
            onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          />
        </div>

        {isOpen && (
          <div
            className="absolute z-50 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg overflow-hidden max-h-48 overflow-y-auto"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            {isSearching ? (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>No products found.</p>
            ) : (
              results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] transition-colors"
                  style={{ color: "var(--color-text)" }}
                >
                  <span className="font-medium">{product.name}</span>
                  {product.generic_name && (
                    <span className="ml-1.5" style={{ color: "var(--color-text-muted)" }}>
                      ({product.generic_name})
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
