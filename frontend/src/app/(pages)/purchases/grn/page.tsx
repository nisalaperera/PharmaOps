"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ClipboardCheck, Search, Trash2, Package,
} from "lucide-react";
import { Button }       from "@/components/ui/Button";
import { Input }        from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPost } from "@/lib/api-client";
import { showToast }       from "@/lib/toast";
import { PURCHASE_INVOICE_STATUS_OPTIONS } from "@/lib/constants";
import type {
  Product, Supplier, Branch, PurchaseOrder, PurchaseInvoice, PaginatedResponse,
} from "@/types";

// ─── Client-only line type ──────────────────────────────────────────────────────

interface GrnLine {
  key:           string;
  product_id:    string;
  product_name:  string;
  sku:           string;
  batch_number:  string;
  expiry_date:   string;
  unit_quantity: number;
  free_quantity: number;
  discount:      number;
  unit_price:    number;
  selling_price: number;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

function lineTotal(l: GrnLine): number {
  return l.unit_quantity * l.unit_price - l.discount;
}

function lkr(n: number): string {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function GrnPage() {
  const { user, permissions } = useAuth();
  const queryClient = useQueryClient();

  // Header / right-panel state
  const [branchId,        setBranchId]        = useState<string>(permissions?.isBranchLevel ? (user?.branchId ?? "") : "");
  const [supplierId,      setSupplierId]      = useState<string>("");
  const [channelId,       setChannelId]       = useState<string>("");
  const [invoiceDate,     setInvoiceDate]     = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [distInvoiceNo,   setDistInvoiceNo]   = useState<string>("");
  const [distInvoiceDate, setDistInvoiceDate] = useState<string>("");
  const [status,          setStatus]          = useState<"DRAFT" | "RECEIVED" | "VERIFIED">("RECEIVED");
  const [returnAmount,    setReturnAmount]    = useState<string>("");
  const [notes,           setNotes]           = useState<string>("");
  const [convertPoId,     setConvertPoId]     = useState<string>("");

  // Line items
  const [lines, setLines] = useState<GrnLine[]>([]);

  // Product search
  const [productSearch,   setProductSearch]   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchFocused,   setSearchFocused]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(productSearch), 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // ── Reference data ──────────────────────────────────────────────────────────
  const { data: branchesData } = useQuery({
    queryKey:  ["grn-branches"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: true, page_size: 100 }),
    enabled:   permissions?.isOrgLevel ?? false,
    staleTime: 5 * 60_000,
  });
  const branches = branchesData?.data ?? [];

  const { data: suppliersData } = useQuery({
    queryKey:  ["grn-suppliers"],
    queryFn:   () => apiGet<PaginatedResponse<Supplier>>("/suppliers", { is_active: "true", supplier_type: "DISTRIBUTOR", page_size: 200 }),
    staleTime: 5 * 60_000,
  });
  const suppliers = suppliersData?.data ?? [];

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey:  ["grn-products", debouncedSearch],
    queryFn:   () => apiGet<PaginatedResponse<Product>>("/products", { search: debouncedSearch, is_active: "true", page_size: 8 }),
    enabled:   debouncedSearch.length >= 2,
    staleTime: 30_000,
  });
  const productResults = productsData?.data ?? [];

  const { data: poData } = useQuery({
    queryKey: ["grn-pos"],
    queryFn:  () => apiGet<PaginatedResponse<PurchaseOrder>>("/purchases/orders", { page_size: 200, sort_by: "created_at", sort_dir: "desc" }),
    select:   (d: PaginatedResponse<PurchaseOrder>) => ({ ...d, data: d.data.filter((po) => po.status === "APPROVED" || po.status === "SENT") }),
  });
  const convertiblePOs = poData?.data ?? [];

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const channelOptions   = selectedSupplier?.distributor_channels ?? [];

  const effectiveBranchId = permissions?.isOrgLevel ? branchId : (user?.branchId ?? "");

  // ── Totals ────────────────────────────────────────────────────────────────────
  const total  = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);
  const retNum = parseFloat(returnAmount || "0") || 0;
  const net    = total - retNum;

  // ── Convert from PO ─────────────────────────────────────────────────────────
  function applyPO(poId: string) {
    setConvertPoId(poId);
    if (!poId) return;
    const po = convertiblePOs.find((p) => p.id === poId);
    if (!po) return;
    if (permissions?.isOrgLevel) setBranchId(po.branch_id);
    setSupplierId(po.supplier_id);
    setChannelId(po.channel_id);
    setLines(po.items.map((it) => ({
      key: newKey(), product_id: it.product_id, product_name: it.product_name,
      sku: it.sku ?? "", batch_number: "", expiry_date: "",
      unit_quantity: it.unit_quantity, free_quantity: it.free_quantity ?? 0,
      discount: it.discount ?? 0, unit_price: it.unit_price, selling_price: 0,
    })));
    setReturnAmount(String(po.return_amount ?? 0));
    showToast("success", "Order Loaded", `${po.items.length} item(s) and return amount populated from purchase order.`);
  }

  // ── Line operations ─────────────────────────────────────────────────────────
  function addProduct(p: Product) {
    setLines((prev) => [...prev, {
      key: newKey(), product_id: p.id, product_name: p.name,
      sku: "", batch_number: "", expiry_date: "",
      unit_quantity: 1, free_quantity: 0, discount: 0, unit_price: 0, selling_price: 0,
    }]);
    setProductSearch("");
  }

  function updateLine(key: string, patch: Partial<GrnLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function resetAll() {
    setLines([]); setSupplierId(""); setChannelId("");
    setInvoiceDate(format(new Date(), "yyyy-MM-dd"));
    setDistInvoiceNo(""); setDistInvoiceDate(""); setStatus("RECEIVED");
    setReturnAmount(""); setNotes(""); setConvertPoId("");
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (payload: object) => apiPost<PurchaseInvoice>("/purchases/invoices", payload),
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast("success", "Invoice Created", `${inv.invoice_number} recorded${inv.status === "VERIFIED" ? " and posted to inventory" : ""}.`);
      resetAll();
    },
    onError: (err: { message?: string }) => showToast("error", "Create Failed", err?.message ?? "Something went wrong. Please try again."),
  });

  function validate(): string | null {
    if (!effectiveBranchId) return "Select a branch to continue.";
    if (!supplierId)        return "Select a distributor.";
    if (!channelId)         return "Select a distributor channel.";
    if (lines.length === 0) return "Add at least one item.";
    for (const l of lines) {
      if (!l.batch_number.trim())                  return `Batch No is required for ${l.product_name}.`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(l.expiry_date)) return `Expiry date is required for ${l.product_name}.`;
      if (l.unit_quantity < 1)                     return `Unit Qty must be at least 1 for ${l.product_name}.`;
    }
    return null;
  }

  function handleSubmit() {
    const error = validate();
    if (error) { showToast("error", "Cannot Create Invoice", error); return; }

    mutation.mutate({
      branch_id:                effectiveBranchId,
      supplier_id:              supplierId,
      channel_id:               channelId,
      invoice_date:             invoiceDate,
      purchase_order_id:        convertPoId || null,
      distributor_invoice_no:   distInvoiceNo || null,
      distributor_invoice_date: distInvoiceDate || null,
      status,
      items: lines.map((l) => ({
        product_id:    l.product_id,
        product_name:  l.product_name,
        sku:           l.sku,
        batch_number:  l.batch_number,
        expiry_date:   l.expiry_date,
        unit_quantity: l.unit_quantity,
        free_quantity: l.free_quantity,
        discount:      l.discount,
        unit_price:    l.unit_price,
        selling_price: l.selling_price,
      })),
      return_items:         [],
      manual_total_amount:  null,
      manual_return_amount: retNum,
      notes:                notes || null,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── LEFT: search + line items ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r" style={{ borderColor: "var(--color-border)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>Goods Received Note</h1>
          </div>
          <div className="flex items-center gap-2">
            {convertiblePOs.length > 0 && (
              <select value={convertPoId} onChange={(e) => applyPO(e.target.value)} className="form-select text-sm w-56">
                <option value="">Convert from PO…</option>
                {convertiblePOs.map((po) => (
                  <option key={po.id} value={po.id}>#{po.id.slice(0, 8).toUpperCase()} — {po.supplier_name}</option>
                ))}
              </select>
            )}
            {permissions?.isOrgLevel ? (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="form-select text-sm w-44">
                <option value="">— Select Branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : (
              <span className="text-xs font-medium px-2 py-1 rounded" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-2)" }}>Branch Terminal</span>
            )}
          </div>
        </div>

        {/* Product search */}
        <div className="px-5 py-3 border-b flex-shrink-0 relative" style={{ borderColor: "var(--color-border)" }}>
          <Input
            placeholder="Search product to add by name…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            leftIcon={<Search className="w-4 h-4" />}
          />
          {searchFocused && debouncedSearch.length >= 2 && (
            <div className="absolute left-5 right-5 top-[calc(100%-4px)] z-30 rounded-xl shadow-xl border overflow-hidden" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
              {productsLoading && <p className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>Searching…</p>}
              {!productsLoading && productResults.length === 0 && (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>No products matching &ldquo;{debouncedSearch}&rdquo;</p>
              )}
              {productResults.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={() => addProduct(p)}
                  className="w-full flex items-center justify-between px-4 py-3 border-b last:border-0 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{p.generic_name} · {p.brand_name}</p>
                  </div>
                  <Package className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-text-muted)" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items header */}
        <div className="flex items-center justify-between px-5 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            Items {lines.length > 0 && `· ${lines.length}`}
          </span>
          {lines.length > 0 && <button onClick={() => setLines([])} className="text-xs text-danger-500 hover:underline">Clear all</button>}
        </div>

        {/* Line items body */}
        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <Package className="w-14 h-14 mb-4 opacity-10" style={{ color: "var(--color-text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Search above to add products to receive</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {lines.map((l) => (
                <div key={l.key} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{l.product_name}</p>
                    <button onClick={() => removeLine(l.key)} className="p-1 rounded transition-colors hover:bg-danger-50 dark:hover:bg-danger-900/20 text-danger-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))" }}>
                    <Field label="Batch No *">
                      <input className="grn-cell" value={l.batch_number} onChange={(e) => updateLine(l.key, { batch_number: e.target.value })} />
                    </Field>
                    <Field label="SKU">
                      <input className="grn-cell" value={l.sku} onChange={(e) => updateLine(l.key, { sku: e.target.value })} />
                    </Field>
                    <Field label="Expiry *">
                      <input type="date" className="grn-cell" value={l.expiry_date} onChange={(e) => updateLine(l.key, { expiry_date: e.target.value })} />
                    </Field>
                    <Field label="Unit Qty *">
                      <input type="number" min={1} className="grn-cell text-right" value={l.unit_quantity} onChange={(e) => updateLine(l.key, { unit_quantity: parseInt(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Free">
                      <input type="number" min={0} className="grn-cell text-right" value={l.free_quantity} onChange={(e) => updateLine(l.key, { free_quantity: parseInt(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Discount">
                      <input type="number" min={0} step={0.01} className="grn-cell text-right" value={l.discount || ""} onChange={(e) => updateLine(l.key, { discount: parseFloat(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Unit Price">
                      <input type="number" min={0} step={0.01} className="grn-cell text-right" value={l.unit_price || ""} onChange={(e) => updateLine(l.key, { unit_price: parseFloat(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Sell Price">
                      <input type="number" min={0} step={0.01} className="grn-cell text-right" value={l.selling_price || ""} onChange={(e) => updateLine(l.key, { selling_price: parseFloat(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Line Total">
                      <div className="grn-cell text-right tabular-nums flex items-center justify-end" style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>{lkr(lineTotal(l))}</div>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: invoice details + summary ───────────────────────────────────── */}
      <div className="w-80 flex flex-col overflow-y-auto flex-shrink-0" style={{ background: "var(--color-surface)" }}>

        {/* Distributor */}
        <div className="p-4 border-b space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Distributor</p>
          <Autocomplete
            value={supplierId}
            onChange={(v) => { setSupplierId(v); setChannelId(""); }}
            options={suppliers.map((s) => ({ value: s.id, label: s.short_name }))}
            placeholder="Search distributor…"
          />
          <Autocomplete
            value={channelId}
            onChange={setChannelId}
            options={channelOptions.map((ch, idx) => ({ value: ch.id ?? String(idx), label: ch.channel_name }))}
            placeholder={supplierId ? "Select channel…" : "Select distributor first"}
            disabled={!supplierId}
          />
        </div>

        {/* Invoice meta */}
        <div className="p-4 border-b space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <div>
            <label className="grn-label">Invoice Date</label>
            <input type="date" className="form-input w-full text-sm" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="grn-label">Dist. Invoice No</label>
              <input className="form-input w-full text-sm" value={distInvoiceNo} onChange={(e) => setDistInvoiceNo(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="grn-label">Dist. Inv. Date</label>
              <input type="date" className="form-input w-full text-sm" value={distInvoiceDate} onChange={(e) => setDistInvoiceDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="grn-label">Status</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PURCHASE_INVOICE_STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setStatus(o.value)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${status === o.value ? "bg-primary-500 text-white shadow-sm" : "hover:bg-[var(--color-surface-2)]"}`}
                  style={{ color: status === o.value ? undefined : "var(--color-text)" }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {status === "VERIFIED" && <p className="text-xs mt-1.5 text-amber-500">Items post to inventory immediately.</p>}
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Summary</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Total</span>
              <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{lkr(total)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span style={{ color: "var(--color-text-muted)" }}>Return</span>
              <input type="number" min={0} step={0.01} value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} placeholder="0.00"
                     className="w-24 text-sm text-right bg-transparent border-b focus:border-primary-500 outline-none tabular-nums" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
            </div>
            <div className="h-px my-1" style={{ background: "var(--color-border)" }} />
            <div className="flex justify-between font-bold text-base">
              <span style={{ color: "var(--color-text)" }}>Net Payable</span>
              <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{lkr(net)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <label className="grn-label">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" className="form-input w-full resize-none text-sm" />
        </div>

        {/* Action */}
        <div className="p-4 mt-auto">
          <Button variant="primary" className="w-full" size="lg" onClick={handleSubmit} isLoading={mutation.isPending} disabled={lines.length === 0}>
            Create Invoice · {lkr(net)}
          </Button>
        </div>
      </div>

      <style jsx global>{`
        .grn-cell {
          width: 100%;
          height: 2rem;
          padding: 0 0.5rem;
          font-size: 0.8125rem;
          border-radius: 0.375rem;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text);
          outline: none;
        }
        .grn-cell:focus { border-color: var(--color-primary-500, #6366f1); }
        .grn-label {
          display: block;
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.375rem;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}

// ─── Small field wrapper ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}
