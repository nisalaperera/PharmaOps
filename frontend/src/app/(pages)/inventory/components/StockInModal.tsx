"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { Modal }        from "@/components/ui/Modal";
import { Button }       from "@/components/ui/Button";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiPost, apiGet } from "@/lib/api-client";
import { showToast }    from "@/lib/toast";
import { formatQuantity } from "@/lib/utils";
import { FormattedInput } from "@/components/ui/FormattedInput";
import { useAuth }      from "@/hooks/useAuth";
import { useBranch }    from "@/hooks/useBranch";
import { StockLocationQuickCreateModal } from "./StockLocationQuickCreateModal";
import type { InventoryItem, Product, ProductCategory, ProductGeneric, Branch, StockLocation, PaginatedResponse } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockInRow {
  id:                string;
  product_id:        string;
  sku:               string;
  batch_number:      string;
  expiry_date:       string;
  quantity:          number;
  purchase_price:    number;
  selling_price:     number;
  stock_location_id: string;
  notes:             string;
}

interface StockInModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  inventoryItem: InventoryItem | null;
}

function generateRowId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function createEmptyRow(productId?: string): StockInRow {
  return {
    id: generateRowId(),
    product_id: productId ?? "",
    sku: "",
    batch_number: "",
    expiry_date: "",
    quantity: 1,
    purchase_price: 0,
    selling_price: 0,
    stock_location_id: "",
    notes: "",
  };
}

// ─── Column header helper ────────────────────────────────────────────────────

function TH({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider ${className ?? ""}`}
      style={{ color: "var(--color-text-muted)" }}>
      {children}
    </th>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StockInModal({ isOpen, onClose, inventoryItem }: StockInModalProps) {
  const queryClient        = useQueryClient();
  const { permissions }    = useAuth();
  const { activeBranchId } = useBranch();
  const isFreeMode         = inventoryItem === null;
  const isOrgLevel         = permissions?.isOrgLevel ?? false;
  const showBranchField    = isFreeMode && isOrgLevel;

  const [branchId, setBranchId]                     = useState("");
  const [rows, setRows]                             = useState<StockInRow[]>([createEmptyRow()]);
  const [locationModalOpen, setLocationModalOpen]    = useState(false);
  const [locationCreateForRow, setLocationCreateForRow] = useState<string | null>(null);

  // ── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setBranchId("");
      setRows(!isFreeMode && inventoryItem
        ? [createEmptyRow(inventoryItem.product_id)]
        : [createEmptyRow()]);
    }
  }, [isOpen, isFreeMode, inventoryItem]);

  // ── Data queries ───────────────────────────────────────────────────────────

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-select"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 200 }),
    enabled:   isOpen && showBranchField,
    staleTime: 5 * 60 * 1000,
  });
  const branchOptions = (branchesData?.data ?? []).map((b) => ({ value: b.id, label: b.name }));

  const { data: productsData } = useQuery<PaginatedResponse<Product>>({
    queryKey:  ["products-all"],
    queryFn:   () => apiGet<PaginatedResponse<Product>>("/products", { page_size: 500, is_active: true }),
    enabled:   isOpen,
    staleTime: 5 * 60 * 1000,
  });
  const products       = productsData?.data ?? [];
  const productOptions = products.map((p) => ({ value: p.id, label: p.name }));

  const { data: stockLocations = [] } = useQuery<StockLocation[]>({
    queryKey: ["stock-locations", activeBranchId],
    queryFn:  () => apiGet<StockLocation[]>("/stock-locations", {
      ...(activeBranchId && { branch_id: activeBranchId }),
      is_active: true,
    }),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });
  const locationOptions = stockLocations.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` }));

  const { data: categoriesData = [] } = useQuery<ProductCategory[]>({
    queryKey: ["categories"],
    queryFn:  () => apiGet<ProductCategory[]>("/products/categories"),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: genericsData } = useQuery<ProductGeneric[]>({
    queryKey: ["generics"],
    queryFn:  () => apiGet<ProductGeneric[]>("/products/generics"),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });
  const generics = genericsData ?? [];

  // ── Row helpers ────────────────────────────────────────────────────────────

  const updateRow = useCallback((rowId: string, updates: Partial<StockInRow>) => {
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, ...updates } : r));
  }, []);

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow(!isFreeMode ? (inventoryItem?.product_id ?? "") : "")]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== rowId) : prev);
  }

  // ── SKU helpers ────────────────────────────────────────────────────────────

  function getSkuOptions(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return [];
    return [
      { value: product.basic_sku_name, label: product.basic_sku_name },
      ...product.sku_mappings.map((m) => ({
        value: m.sku,
        label: `${m.sku} (${m.mapped_sku_count} ${product.basic_sku_name})`,
      })),
    ];
  }

  function getBasicSkuCount(productId: string, sku: string, quantity: number): number {
    const product = products.find((p) => p.id === productId);
    if (!product) return quantity;
    if (sku === product.basic_sku_name) return quantity;
    const mapping = product.sku_mappings.find((m) => m.sku === sku);
    return mapping ? quantity * mapping.basic_sku_count : quantity;
  }

  function getBasicSkuName(productId: string): string {
    return products.find((p) => p.id === productId)?.basic_sku_name ?? "units";
  }

  // ── Margin helper ──────────────────────────────────────────────────────────

  function getEffectiveMargin(productId: string): number | null {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    const category = categoriesData.find((c) => c.id === product.category_id);
    return category?.effective_margin_percentage ?? null;
  }

  function calcSellingPrice(purchasePrice: number, marginPercent: number): number {
    return Math.round(purchasePrice * (1 + marginPercent / 100) * 100) / 100;
  }

  // ── Auto-populate stock location ──────────────────────────────────────────

  function autoPopulateStockLocation(rowId: string, productId: string, expiryDate: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    if (expiryDate && product.brand_name) {
      const expiryYear = expiryDate.substring(0, 4);
      const autoName   = `EXP-${product.brand_name}-${expiryYear}`;
      const match      = stockLocations.find((l) => l.name.toLowerCase() === autoName.toLowerCase());
      if (match) {
        updateRow(rowId, { stock_location_id: match.id });
        return;
      }
    }

    if (product.generic_id) {
      const generic = generics.find((g) => g.id === product.generic_id);
      if (generic?.stock_location_id) {
        updateRow(rowId, { stock_location_id: generic.stock_location_id });
        return;
      }
    }
  }

  // ── Summary computation ────────────────────────────────────────────────────

  const productGroups = rows.reduce<Record<string, { totalBasic: number; expiryBasic: number }>>((acc, row) => {
    if (!row.product_id || row.quantity <= 0) return acc;
    const basicQty = getBasicSkuCount(row.product_id, row.sku, row.quantity);
    if (!acc[row.product_id]) acc[row.product_id] = { totalBasic: 0, expiryBasic: 0 };
    acc[row.product_id].totalBasic += basicQty;
    if (row.expiry_date && new Date(row.expiry_date) < new Date()) {
      acc[row.product_id].expiryBasic += basicQty;
    }
    return acc;
  }, {});

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (showBranchField && !branchId) return "Branch is required";
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.product_id)        return `Row ${i + 1}: Product is required`;
      if (!r.sku)               return `Row ${i + 1}: SKU is required`;
      if (!r.batch_number)      return `Row ${i + 1}: Batch number is required`;
      if (!r.expiry_date)       return `Row ${i + 1}: Expiry date is required`;
      if (r.quantity < 1)       return `Row ${i + 1}: Quantity must be at least 1`;
      if (r.selling_price <= 0) return `Row ${i + 1}: Selling price is required`;
      if (r.purchase_price < 0) return `Row ${i + 1}: Purchase price cannot be negative`;
      if (!r.stock_location_id) return `Row ${i + 1}: Stock location is required`;
    }
    return null;
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (payload: StockInRow[]) => {
      const items = payload.map((r) => ({
        product_id:        r.product_id,
        sku:               r.sku,
        batch_number:      r.batch_number,
        expiry_date:       r.expiry_date,
        quantity:          r.quantity,
        purchase_price:    r.purchase_price,
        selling_price:     r.selling_price,
        stock_location_id: r.stock_location_id,
        notes:             r.notes || undefined,
      }));

      if (!isFreeMode && inventoryItem) {
        return apiPost(`/inventory/${inventoryItem.id}/stock-in/batch`, { items });
      }
      return apiPost("/inventory/stock-in/batch", { branch_id: branchId || undefined, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      showToast("success", "Stock Added", `${rows.length} batch${rows.length > 1 ? "es" : ""} added successfully.`);
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Stock In Failed", err?.message ?? "Something went wrong.");
    },
  });

  function handleSubmit() {
    const error = validate();
    if (error) {
      showToast("error", "Validation Error", error);
      return;
    }
    mutation.mutate(rows);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Stock In"
        size="full"
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              leftIcon={<PackagePlus className="w-4 h-4" />}
              onClick={handleSubmit}
              isLoading={mutation.isPending}
            >
              Add Stock ({rows.length} batch{rows.length > 1 ? "es" : ""})
            </Button>
          </>
        }
      >
        <div className="space-y-4">

          {/* Branch selector for org-level users */}
          {showBranchField && (
            <div className="max-w-xs">
              <Autocomplete
                label="Branch"
                required
                options={branchOptions}
                value={branchId}
                onChange={setBranchId}
                placeholder="Select branch..."
              />
            </div>
          )}

          {/* Fixed product label in row mode */}
          {!isFreeMode && inventoryItem && (
            <div className="px-3 py-2 rounded-lg text-sm font-semibold inline-block"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
              {inventoryItem.product_name}
            </div>
          )}

          {/* Add batch button */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Batches ({rows.length})
            </span>
            <Button type="button" variant="outline" size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={addRow}>
              Add Batch
            </Button>
          </div>

          {/* Table with header row */}
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr style={{ background: "var(--color-table-header)" }}>
                  <TH className="w-8">#</TH>
                  {isFreeMode && <TH>Product</TH>}
                  <TH className="w-[100px]">SKU</TH>
                  <TH className="w-[120px]">Batch No.</TH>
                  <TH className="w-[130px]">Expiry Date</TH>
                  <TH className="w-[70px]">Qty</TH>
                  <TH className="w-[80px]">Basic Qty</TH>
                  <TH className="w-[100px]">Sell Price</TH>
                  <TH className="w-[100px]">Buy Price</TH>
                  <TH>Stock Location</TH>
                  <TH className="w-10">{""}</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const basicQty  = getBasicSkuCount(row.product_id, row.sku, row.quantity);
                  const basicUnit = getBasicSkuName(row.product_id);
                  const isExpired = row.expiry_date && new Date(row.expiry_date) < new Date();

                  return (
                    <tr key={row.id} className="border-t align-top"
                      style={{ borderColor: "var(--color-border)", background: isExpired ? "var(--color-danger-50, rgba(239,68,68,0.04))" : undefined }}>

                      {/* # */}
                      <td className="px-2 py-2 text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                        {index + 1}
                      </td>

                      {/* Product */}
                      {isFreeMode && (
                        <td className="px-1 py-1.5">
                          <Autocomplete
                            options={productOptions}
                            value={row.product_id}
                            onChange={(val) => {
                              const prod = products.find((p) => p.id === val);
                              updateRow(row.id, { product_id: val, sku: prod?.basic_sku_name ?? "" });
                              if (val && row.expiry_date) autoPopulateStockLocation(row.id, val, row.expiry_date);
                            }}
                            placeholder="Product..."
                          />
                        </td>
                      )}

                      {/* SKU */}
                      <td className="px-1 py-1.5">
                        <select className="form-select text-xs w-full" value={row.sku}
                          onChange={(e) => updateRow(row.id, { sku: e.target.value })}>
                          <option value="">...</option>
                          {getSkuOptions(row.product_id).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>

                      {/* Batch No */}
                      <td className="px-1 py-1.5">
                        <input type="text" className="form-input text-xs w-full" placeholder="Batch #"
                          value={row.batch_number}
                          onChange={(e) => updateRow(row.id, { batch_number: e.target.value })} />
                      </td>

                      {/* Expiry */}
                      <td className="px-1 py-1.5">
                        <input type="date" className="form-input text-xs w-full"
                          value={row.expiry_date}
                          onChange={(e) => {
                            updateRow(row.id, { expiry_date: e.target.value });
                            autoPopulateStockLocation(row.id, row.product_id, e.target.value);
                          }} />
                      </td>

                      {/* Qty */}
                      <td className="px-1 py-1.5">
                        <FormattedInput
                          format="quantity"
                          min={1}
                          className="text-xs w-full"
                          placeholder="1"
                          value={row.quantity}
                          onChange={(v) => updateRow(row.id, { quantity: v })}
                        />
                      </td>

                      {/* Basic Qty (computed) */}
                      <td className="px-2 py-2">
                        <div className="text-xs text-right font-mono" style={{ color: "var(--color-text-muted)" }}>
                          {row.product_id && row.sku && row.quantity > 0 ? (
                            <><strong>{formatQuantity(basicQty)}</strong> <span className="text-[10px]">{basicUnit}</span></>
                          ) : "—"}
                        </div>
                      </td>

                      {/* Sell Price */}
                      <td className="px-1 py-1.5">
                        <FormattedInput
                          format="amount"
                          className="text-xs w-full"
                          placeholder="0.00"
                          value={row.selling_price}
                          onChange={(v) => updateRow(row.id, { selling_price: v })}
                          min={0}
                        />
                      </td>

                      {/* Buy Price */}
                      <td className="px-1 py-1.5">
                        <FormattedInput
                          format="amount"
                          className="text-xs w-full"
                          placeholder="0.00"
                          value={row.purchase_price}
                          onChange={(v) => {
                            const margin = getEffectiveMargin(row.product_id);
                            const updates: Partial<StockInRow> = { purchase_price: v };
                            if (margin != null && v > 0 && row.selling_price === 0) {
                              updates.selling_price = calcSellingPrice(v, margin);
                            }
                            updateRow(row.id, updates);
                          }}
                          min={0}
                        />
                      </td>

                      {/* Stock Location */}
                      <td className="px-1 py-1.5">
                        <Autocomplete
                          options={locationOptions}
                          value={row.stock_location_id}
                          onChange={(val) => updateRow(row.id, { stock_location_id: val })}
                          placeholder="Location..."
                          onCreateNew={() => {
                            setLocationCreateForRow(row.id);
                            setLocationModalOpen(true);
                          }}
                        />
                      </td>

                      {/* Remove */}
                      <td className="px-1 py-2 text-center">
                        <button type="button" onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors disabled:opacity-30">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary per product */}
          {Object.keys(productGroups).length > 0 && (
            <div className="rounded-xl border p-3 space-y-1" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                Summary
              </span>
              {Object.entries(productGroups).map(([productId, summary]) => {
                const product  = products.find((p) => p.id === productId);
                const unitName = product?.basic_sku_name ?? "units";
                return (
                  <div key={productId}
                    className="flex items-center justify-between text-sm py-1.5 border-t first:border-t-0"
                    style={{ borderColor: "var(--color-border)" }}>
                    <span className="font-medium truncate mr-4" style={{ color: "var(--color-text)" }}>
                      {product?.name ?? productId}
                    </span>
                    <div className="flex items-center gap-5 flex-shrink-0">
                      <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                        Total: <strong style={{ color: "var(--color-text)" }}>{formatQuantity(summary.totalBasic)}</strong> {unitName}
                      </span>
                      {summary.expiryBasic > 0 && (
                        <span className="text-xs font-mono text-danger-500">
                          Expired: <strong>{formatQuantity(summary.expiryBasic)}</strong> {unitName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Quick-create stock location */}
      <StockLocationQuickCreateModal
        isOpen={locationModalOpen}
        onClose={() => { setLocationModalOpen(false); setLocationCreateForRow(null); }}
        onCreated={(newLocationId) => {
          if (locationCreateForRow) {
            updateRow(locationCreateForRow, { stock_location_id: newLocationId });
          }
          queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
        }}
      />
    </>
  );
}
