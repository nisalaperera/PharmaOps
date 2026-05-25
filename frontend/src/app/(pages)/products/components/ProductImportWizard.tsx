"use client";

import { useState, useRef } from "react";
import {
  Upload, Download, FileText, CheckCircle, AlertCircle,
  X, ArrowRight, Loader2, Ban,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal }        from "@/components/ui/Modal";
import { Button }       from "@/components/ui/Button";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiGet, apiPost } from "@/lib/api-client";
import { SKU_TYPE_OPTIONS }              from "@/lib/constants";
import { cn }                            from "@/lib/utils";
import type {
  ProductGeneric, ProductBrand, ProductCategory, ProductSku,
  ImportResult, SkuType,
} from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep     = "upload" | "resolve" | "importing" | "done";
type ResolutionMode = "create" | "map" | "reject";

interface UnknownItem {
  csvName:   string;
  mode:      ResolutionMode;
  mappedId:  string;
  mappedName: string;
  skuType:   SkuType;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      cells.push(cur); cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseCsvText(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const text  = raw.replace(/^﻿/, "").trim();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows    = lines
    .slice(1)
    .map((ln) => {
      const vals = parseCsvLine(ln);
      return headers.reduce<Record<string, string>>((acc, h, i) => {
        acc[h] = (vals[i] ?? "").trim();
        return acc;
      }, {});
    })
    .filter((r) => headers.some((h) => r[h]));
  return { headers, rows };
}

function buildCsvText(
  headers: string[],
  rows:    Record<string, string>[],
  subs:    Record<string, Record<string, string>>,
): string {
  const q    = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(q).join(",")];
  for (const row of rows) {
    const r = { ...row };
    for (const [field, map] of Object.entries(subs)) {
      const v = (r[field] ?? "").trim();
      if (v && map[v]) r[field] = map[v];
    }
    lines.push(headers.map((h) => q(r[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

function detectUnknowns(
  rows:     Record<string, string>[],
  field:    string,
  existing: Set<string>,
): UnknownItem[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = (row[field] ?? "").trim();
    if (v && !existing.has(v.toLowerCase())) seen.add(v);
  }
  return [...seen].sort().map((csvName) => ({
    csvName, mode: "create", mappedId: "", mappedName: "", skuType: "COUNT",
  }));
}

// ─── StepBar ──────────────────────────────────────────────────────────────────

function StepBar({ step }: { step: WizardStep }) {
  const labels    = ["Upload", "Review", "Done"];
  const activeIdx = step === "upload" ? 0 : step === "done" ? 2 : 1;
  return (
    <div className="flex items-center gap-1 mb-5">
      {labels.map((label, i) => {
        const done = i < activeIdx;
        const cur  = i === activeIdx;
        return (
          <div key={label} className="flex items-center gap-1">
            <div className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold flex-shrink-0",
              done ? "bg-primary-500 text-white"
                   : cur  ? "ring-2 ring-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300"
                           : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
            )}>
              {done ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={cn(
              "text-xs font-medium mr-2",
              cur ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
            )}>
              {label}
            </span>
            {i < labels.length - 1 && (
              <div className="w-6 h-px mr-2 flex-shrink-0" style={{ background: "var(--color-border)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── UnknownSection ───────────────────────────────────────────────────────────

interface UnknownSectionProps {
  label:       string;
  items:       UnknownItem[];
  options:     { value: string; label: string }[];
  onChange:    (index: number, patch: Partial<UnknownItem>) => void;
  showSkuType?: boolean;
}

function UnknownSection({ label, items, options, onChange, showSkuType }: UnknownSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mt-4 mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </span>
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          {items.length}
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
      </div>

      <div className="space-y-1.5">
        {items.map((item, index) => {
          const unresolved = item.mode === "map" && !item.mappedId;
          const rejected   = item.mode === "reject";
          return (
            <div
              key={item.csvName}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 transition-colors",
                unresolved ? "ring-1 ring-amber-400 dark:ring-amber-600" : "",
                rejected   ? "opacity-50"                                 : "",
              )}
              style={{ background: "var(--color-surface-2)" }}
            >
              {/* CSV name pill */}
              <span
                className={cn(
                  "text-xs font-mono font-semibold px-2 py-0.5 rounded flex-shrink-0",
                  rejected && "line-through"
                )}
                style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
              >
                {item.csvName}
              </span>

              {/* Mode toggle */}
              <div
                className="flex items-center rounded-lg overflow-hidden border flex-shrink-0"
                style={{ borderColor: "var(--color-border)" }}
              >
                <button
                  type="button"
                  onClick={() => onChange(index, { mode: "create", mappedId: "", mappedName: "" })}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors",
                    item.mode === "create"
                      ? "bg-primary-500 text-white"
                      : "hover:bg-[var(--color-surface)]"
                  )}
                  style={item.mode !== "create" ? { color: "var(--color-text-muted)" } : undefined}
                >
                  + Create New
                </button>
                <button
                  type="button"
                  onClick={() => onChange(index, { mode: "map", mappedId: "", mappedName: "" })}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors border-l",
                    item.mode === "map"
                      ? "bg-amber-500 text-white"
                      : "hover:bg-[var(--color-surface)]"
                  )}
                  style={{
                    borderColor: "var(--color-border)",
                    ...(item.mode !== "map" ? { color: "var(--color-text-muted)" } : undefined),
                  }}
                >
                  Map to Existing
                </button>
                <button
                  type="button"
                  onClick={() => onChange(index, { mode: "reject", mappedId: "", mappedName: "" })}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors border-l flex items-center gap-1",
                    item.mode === "reject"
                      ? "bg-danger-500 text-white"
                      : "hover:bg-[var(--color-surface)]"
                  )}
                  style={{
                    borderColor: "var(--color-border)",
                    ...(item.mode !== "reject" ? { color: "var(--color-text-muted)" } : undefined),
                  }}
                >
                  <Ban className="w-3 h-3" />
                  Reject
                </button>
              </div>

              {/* SKU type selector — only for SKUs in create mode */}
              {showSkuType && item.mode === "create" && (
                <select
                  className="form-select text-xs h-[30px] py-0 flex-shrink-0"
                  value={item.skuType}
                  onChange={(e) => onChange(index, { skuType: e.target.value as SkuType })}
                >
                  {SKU_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}

              {/* Existing entry autocomplete — only in map mode */}
              {item.mode === "map" && (
                <Autocomplete
                  className="min-w-[200px] flex-1"
                  placeholder="Select existing entry…"
                  options={options}
                  value={item.mappedId}
                  onChange={(id) => {
                    const opt = options.find((o) => o.value === id);
                    onChange(index, { mappedId: id, mappedName: opt?.label ?? "" });
                  }}
                />
              )}

              {unresolved && (
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex-shrink-0 ml-auto">
                  Select one
                </span>
              )}

              {rejected && (
                <span className="text-[10px] font-medium text-danger-500 flex-shrink-0 ml-auto">
                  Rows will be skipped
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RecognizedRow ────────────────────────────────────────────────────────────

function RecognizedRow({ label, count }: { label: string; count: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 mt-4 mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
      </div>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: "var(--color-surface-2)" }}
      >
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          All {count} {label.toLowerCase()} recognized — no action needed
        </span>
      </div>
    </div>
  );
}

// ─── ProductImportWizard ──────────────────────────────────────────────────────

interface ProductImportWizardProps {
  isOpen:             boolean;
  onClose:            () => void;
  onImport:           (file: File) => Promise<ImportResult>;
  onDownloadTemplate: () => Promise<void>;
  templateNote:       string;
}

export function ProductImportWizard({
  isOpen,
  onClose,
  onImport,
  onDownloadTemplate,
  templateNote,
}: ProductImportWizardProps) {
  const queryClient = useQueryClient();

  // ─── Catalog data ────────────────────────────────────────────────────────────
  const { data: generics   = [] } = useQuery<ProductGeneric[]>({
    queryKey: ["generics"],
    queryFn:  () => apiGet<ProductGeneric[]>("/products/generics"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: brands     = [] } = useQuery<ProductBrand[]>({
    queryKey: ["brands"],
    queryFn:  () => apiGet<ProductBrand[]>("/products/brands"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ["categories"],
    queryFn:  () => apiGet<ProductCategory[]>("/products/categories"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: skus       = [] } = useQuery<ProductSku[]>({
    queryKey: ["skus"],
    queryFn:  () => apiGet<ProductSku[]>("/products/skus"),
    staleTime: 5 * 60 * 1000,
  });

  // ─── State ───────────────────────────────────────────────────────────────────
  const [step,           setStep]          = useState<WizardStep>("upload");
  const [selectedFile,   setSelectedFile]  = useState<File | null>(null);
  const [csvHeaders,     setCsvHeaders]    = useState<string[]>([]);
  const [parsedRows,     setParsedRows]    = useState<Record<string, string>[]>([]);
  const [isDragOver,     setIsDragOver]    = useState(false);
  const [fileError,      setFileError]     = useState<string | null>(null);
  const [importError,    setImportError]   = useState<string | null>(null);
  const [importResult,   setImportResult]  = useState<ImportResult | null>(null);
  const [isDlTpl,        setIsDlTpl]       = useState(false);
  const [genericItems,   setGenericItems]  = useState<UnknownItem[]>([]);
  const [brandItems,     setBrandItems]    = useState<UnknownItem[]>([]);
  const [categoryItems,  setCategoryItems] = useState<UnknownItem[]>([]);
  const [skuItems,       setSkuItems]      = useState<UnknownItem[]>([]);
  const [genericTotal,   setGenericTotal]  = useState(0);
  const [brandTotal,     setBrandTotal]    = useState(0);
  const [categoryTotal,  setCategoryTotal] = useState(0);
  const [skuTotal,       setSkuTotal]      = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalUnknowns   = genericItems.length + brandItems.length + categoryItems.length + skuItems.length;
  const allItems        = [...genericItems, ...brandItems, ...categoryItems, ...skuItems];
  const unresolvedCount = allItems.filter((i) => i.mode === "map" && !i.mappedId).length;
  const rejectedCount   = allItems.filter((i) => i.mode === "reject").length;

  // ─── Reset & close ───────────────────────────────────────────────────────────
  function resetWizard() {
    setStep("upload");
    setSelectedFile(null);
    setCsvHeaders([]); setParsedRows([]);
    setFileError(null); setImportError(null); setImportResult(null);
    setGenericItems([]); setBrandItems([]); setCategoryItems([]); setSkuItems([]);
    setGenericTotal(0);  setBrandTotal(0);  setCategoryTotal(0);  setSkuTotal(0);
  }

  function handleClose() { resetWizard(); onClose(); }

  // ─── File selection & parsing ─────────────────────────────────────────────────
  function applyFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Only .csv files are accepted."); return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, rows } = parseCsvText(e.target?.result as string ?? "");
      setCsvHeaders(headers);
      setParsedRows(rows);
      setSelectedFile(file);

      const countUnique = (field: string) =>
        new Set(rows.map((r) => (r[field] ?? "").trim()).filter(Boolean)).size;

      setGenericItems( detectUnknowns(rows, "generic_name",   new Set(generics.map((g) => g.name.toLowerCase()))));
      setBrandItems(   detectUnknowns(rows, "brand_name",     new Set(brands.map((b) => b.name.toLowerCase()))));
      setCategoryItems(detectUnknowns(rows, "category_name",  new Set(categories.map((c) => c.name.toLowerCase()))));
      setSkuItems(     detectUnknowns(rows, "basic_sku_name", new Set(skus.map((s) => s.name.toLowerCase()))));

      setGenericTotal( countUnique("generic_name"));
      setBrandTotal(   countUnique("brand_name"));
      setCategoryTotal(countUnique("category_name"));
      setSkuTotal(     countUnique("basic_sku_name"));
    };
    reader.readAsText(file);
  }

  // ─── Proceed from upload step ─────────────────────────────────────────────────
  function handleProceedFromUpload() {
    if (totalUnknowns > 0) setStep("resolve");
    else void doImport();
  }

  // ─── Main import logic ────────────────────────────────────────────────────────
  async function doImport() {
    if (!selectedFile) return;
    setStep("importing");
    setImportError(null);

    try {
      // 1. Create new catalog entries (skip if already exists — 409)
      const createEntry = async (endpoint: string, payload: object) => {
        try { await apiPost(endpoint, payload); } catch (e: unknown) {
          if ((e as { statusCode?: number })?.statusCode !== 409) throw e;
        }
      };

      for (const item of genericItems.filter((i) => i.mode === "create"))
        await createEntry("/products/generics", { name: item.csvName });

      for (const item of brandItems.filter((i) => i.mode === "create"))
        await createEntry("/products/brands", { name: item.csvName });

      for (const item of categoryItems.filter((i) => i.mode === "create"))
        await createEntry("/products/categories", { name: item.csvName });

      for (const item of skuItems.filter((i) => i.mode === "create"))
        await createEntry("/products/skus", { name: item.csvName, sku_type: item.skuType });

      // 2. Build rejected-name sets (rows matching these will be excluded)
      const rejectedSets: Record<string, Set<string>> = {
        generic_name:   new Set(genericItems.filter((i) => i.mode === "reject").map((i) => i.csvName.toLowerCase())),
        brand_name:     new Set(brandItems.filter((i) => i.mode === "reject").map((i) => i.csvName.toLowerCase())),
        category_name:  new Set(categoryItems.filter((i) => i.mode === "reject").map((i) => i.csvName.toLowerCase())),
        basic_sku_name: new Set(skuItems.filter((i) => i.mode === "reject").map((i) => i.csvName.toLowerCase())),
      };
      const hasRejections = Object.values(rejectedSets).some((s) => s.size > 0);
      const filteredRows  = hasRejections
        ? parsedRows.filter((row) =>
            !Object.entries(rejectedSets).some(([field, rejected]) => {
              const v = (row[field] ?? "").trim().toLowerCase();
              return v && rejected.has(v);
            })
          )
        : parsedRows;

      // Short-circuit if every row was rejected
      if (filteredRows.length === 0) {
        setImportResult({ created: 0, updated: 0, failed: 0, errors: [] });
        setStep("done");
        return;
      }

      // 3. Build substitution map for "map to existing" items
      const subs: Record<string, Record<string, string>> = {};
      const fieldGroups: [string, UnknownItem[]][] = [
        ["generic_name",   genericItems],
        ["brand_name",     brandItems],
        ["category_name",  categoryItems],
        ["basic_sku_name", skuItems],
      ];
      for (const [field, items] of fieldGroups) {
        const fieldSubs: Record<string, string> = {};
        for (const item of items)
          if (item.mode === "map" && item.mappedName) fieldSubs[item.csvName] = item.mappedName;
        if (Object.keys(fieldSubs).length) subs[field] = fieldSubs;
      }

      // 4. Rebuild CSV — always rebuild when rows were filtered or names substituted
      let importFile = selectedFile;
      if (hasRejections || Object.keys(subs).length > 0) {
        const csvText = buildCsvText(csvHeaders, filteredRows, subs);
        importFile    = new File([csvText], selectedFile.name, { type: "text/csv" });
      }

      // 5. Upload and import
      const result = await onImport(importFile);
      setImportResult(result);

      // Refresh catalog caches so filters/dropdowns reflect new entries
      ["generics", "brands", "categories", "skus"].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );

      setStep("done");
    } catch (err: unknown) {
      setImportError((err as { message?: string })?.message ?? "Import failed. Please try again.");
      setStep(totalUnknowns > 0 ? "resolve" : "upload");
    }
  }

  // ─── Item resolution updater ──────────────────────────────────────────────────
  function updateItem(
    setter: React.Dispatch<React.SetStateAction<UnknownItem[]>>,
    index:  number,
    patch:  Partial<UnknownItem>,
  ) {
    setter((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  // ─── Catalog options for autocomplete ────────────────────────────────────────
  const genericOptions  = generics.map((g) => ({ value: g.id, label: g.name }));
  const brandOptions    = brands.map((b) => ({ value: b.id, label: b.name }));
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.parent_name ? `${c.parent_name} › ${c.name}` : c.name,
  }));
  const skuOptions = skus.map((s) => ({ value: s.id, label: s.name }));

  // ─── Footer ───────────────────────────────────────────────────────────────────
  function renderFooter(): React.ReactNode {
    if (step === "importing") return null;

    if (step === "done") return (
      <div className="flex justify-end w-full">
        <Button variant="primary" onClick={handleClose}>Close</Button>
      </div>
    );

    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          {step === "resolve" && unresolvedCount > 0 && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {unresolvedCount} item{unresolvedCount !== 1 ? "s" : ""} still need{unresolvedCount === 1 ? "s" : ""} a selection
            </span>
          )}
          {step === "resolve" && rejectedCount > 0 && unresolvedCount === 0 && (
            <span className="text-xs font-medium text-danger-500">
              {rejectedCount} item{rejectedCount !== 1 ? "s" : ""} rejected — matching rows will be skipped
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          {step === "upload" && (
            <Button
              variant="primary"
              leftIcon={totalUnknowns > 0 ? <ArrowRight className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              onClick={handleProceedFromUpload}
              disabled={!selectedFile}
            >
              {totalUnknowns > 0
                ? `Review ${totalUnknowns} Unknown${totalUnknowns !== 1 ? "s" : ""}`
                : "Import"}
            </Button>
          )}
          {step === "resolve" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>← Back</Button>
              <Button
                variant="primary"
                leftIcon={<Upload className="w-4 h-4" />}
                onClick={() => void doImport()}
                disabled={unresolvedCount > 0}
              >
                Import
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Products"
      size="full"
      footer={renderFooter()}
    >
      <StepBar step={step} />

      {/* ── Upload step ─────────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Template hint */}
          <div
            className="flex items-start gap-3 rounded-xl p-3"
            style={{ background: "var(--color-surface-2)" }}
          >
            <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--color-primary)" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Download Template</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{templateNote}</p>
            </div>
            <Button
              variant="outline" size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              isLoading={isDlTpl}
              onClick={async () => { setIsDlTpl(true); try { await onDownloadTemplate(); } finally { setIsDlTpl(false); } }}
            >
              Template
            </Button>
          </div>

          {/* Drop zone */}
          <div
            role="button" tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); applyFile(e.dataTransfer.files[0] ?? null); }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
            style={{
              borderColor: isDragOver ? "var(--color-primary)" : "var(--color-border)",
              background:  isDragOver ? "var(--color-surface-2)" : "var(--color-surface)",
            }}
          >
            <input
              ref={fileInputRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => { applyFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
            />
            <Upload
              className="w-8 h-8 mx-auto mb-3"
              style={{ color: isDragOver ? "var(--color-primary)" : "var(--color-text-muted)" }}
            />
            {selectedFile ? (
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{selectedFile.name}</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB · {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""}
                  {totalUnknowns > 0
                    ? ` · ${totalUnknowns} unknown catalog entr${totalUnknowns !== 1 ? "ies" : "y"} found`
                    : " · all catalog entries recognized"}
                  {" · click to change"}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  Drop a CSV file here, or click to browse
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Only .csv files are accepted</p>
              </div>
            )}
          </div>

          {fileError && (
            <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: "var(--color-surface-2)" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 text-danger-500 flex-shrink-0" />
              <p className="text-sm" style={{ color: "var(--color-text)" }}>{fileError}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Resolve step ────────────────────────────────────────────────────── */}
      {step === "resolve" && (
        <div>
          <div
            className="flex items-start gap-2 rounded-xl p-3 mb-1"
            style={{ background: "var(--color-surface-2)" }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
            <p className="text-sm" style={{ color: "var(--color-text)" }}>
              <span className="font-semibold">
                {totalUnknowns} unknown catalog entr{totalUnknowns !== 1 ? "ies" : "y"}
              </span>{" "}
              found in your CSV. Choose{" "}
              <strong>+ Create New</strong> to add them to the catalog, or{" "}
              <strong>Map to Existing</strong> to link to an existing entry.
            </p>
          </div>

          {genericTotal > 0 && (
            genericItems.length > 0 ? (
              <UnknownSection
                label="Generics"
                items={genericItems}
                options={genericOptions}
                onChange={(i, patch) => updateItem(setGenericItems, i, patch)}
              />
            ) : (
              <RecognizedRow label="Generics" count={genericTotal} />
            )
          )}
          {brandTotal > 0 && (
            brandItems.length > 0 ? (
              <UnknownSection
                label="Brands"
                items={brandItems}
                options={brandOptions}
                onChange={(i, patch) => updateItem(setBrandItems, i, patch)}
              />
            ) : (
              <RecognizedRow label="Brands" count={brandTotal} />
            )
          )}
          {categoryTotal > 0 && (
            categoryItems.length > 0 ? (
              <UnknownSection
                label="Categories"
                items={categoryItems}
                options={categoryOptions}
                onChange={(i, patch) => updateItem(setCategoryItems, i, patch)}
              />
            ) : (
              <RecognizedRow label="Categories" count={categoryTotal} />
            )
          )}
          {skuTotal > 0 && (
            skuItems.length > 0 ? (
              <UnknownSection
                label="Basic SKUs"
                items={skuItems}
                options={skuOptions}
                showSkuType
                onChange={(i, patch) => updateItem(setSkuItems, i, patch)}
              />
            ) : (
              <RecognizedRow label="Basic SKUs" count={skuTotal} />
            )
          )}

          {importError && (
            <div
              className="flex items-start gap-2 rounded-xl p-3 mt-4"
              style={{ background: "var(--color-surface-2)" }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 text-danger-500 flex-shrink-0" />
              <p className="text-sm" style={{ color: "var(--color-text)" }}>{importError}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Importing step ──────────────────────────────────────────────────── */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--color-primary)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            {allItems.some((i) => i.mode === "create")
              ? "Creating catalog entries and importing products…"
              : "Importing products…"}
          </p>
        </div>
      )}

      {/* ── Done step ───────────────────────────────────────────────────────── */}
      {step === "done" && importResult && (
        <div className="space-y-3">
          {(importResult.created > 0 || importResult.updated > 0) && (
            <div className={`grid gap-3 ${importResult.failed > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
              <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "var(--color-surface-2)" }}>
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Created</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>{importResult.created}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "var(--color-surface-2)" }}>
                <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Updated</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>{importResult.updated}</p>
                </div>
              </div>
              {importResult.failed > 0 && (
                <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "var(--color-surface-2)" }}>
                  <AlertCircle className="w-5 h-5 text-danger-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Failed</p>
                    <p className="text-2xl font-bold text-danger-600 dark:text-danger-400">{importResult.failed}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {importResult.created === 0 && importResult.updated === 0 && importResult.failed > 0 && (
            <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: "var(--color-surface-2)" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 text-danger-500 flex-shrink-0" />
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Validation failed — no records were imported. Fix the errors below and re-import.
              </p>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div
              className="rounded-xl p-3 max-h-60 overflow-y-auto space-y-2"
              style={{ background: "var(--color-surface-2)" }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--color-text)" }}>
                {importResult.errors.length} row{importResult.errors.length !== 1 ? "s" : ""} with errors
              </p>
              {importResult.errors.map((err, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <X className="w-3 h-3 mt-0.5 text-danger-500 flex-shrink-0" />
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    <span className="font-medium" style={{ color: "var(--color-text)" }}>Row {err.row}:</span>{" "}
                    {err.message}
                  </p>
                </div>
              ))}
            </div>
          )}

          {(importResult.created > 0 || importResult.updated > 0) && importResult.failed === 0 && (
            <div
              className="flex items-center gap-2 rounded-xl p-3"
              style={{ background: "var(--color-surface-2)" }}
            >
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {importResult.created > 0 && importResult.updated > 0
                  ? `${importResult.created} created, ${importResult.updated} updated successfully.`
                  : importResult.created > 0
                  ? `All ${importResult.created} record${importResult.created !== 1 ? "s" : ""} imported successfully.`
                  : `${importResult.updated} record${importResult.updated !== 1 ? "s" : ""} updated successfully.`}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
