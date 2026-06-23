"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, PackagePlus } from "lucide-react";
import { Modal }        from "@/components/ui/Modal";
import { Button }       from "@/components/ui/Button";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { apiGet, apiPost, apiPut } from "@/lib/api-client";
import { showToast }    from "@/lib/toast";
import { formatAmount, formatQuantity } from "@/lib/utils";
import { FormattedInput } from "@/components/ui/FormattedInput";
import { STOCK_OUT_REASON_OPTIONS } from "@/lib/constants";
import { useAuth }      from "@/hooks/useAuth";
import { useBranch }    from "@/hooks/useBranch";
import type { StockMovement, Product, ProductCategory, Branch, InventoryItem, PaginatedResponse } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type MovementType = "STOCK_IN" | "STOCK_OUT";

interface StockInRow {
  id:             string;
  product_id:     string;
  sku:            string;
  batch_number:   string;
  expiry_date:    string;
  quantity:       number;
  margin:         number;
  purchase_price: number;
  selling_price:  number;
  reason:         string;
}

interface StockMovementModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  editingMovement: StockMovement | null;
  defaultType?:    "STOCK_IN" | "STOCK_OUT";
}

function generateRowId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function createEmptyRow(): StockInRow {
  return {
    id:             generateRowId(),
    product_id:     "",
    sku:            "",
    batch_number:   "",
    expiry_date:    "",
    quantity:       1,
    margin:         0,
    purchase_price: 0,
    selling_price:  0,
    reason:         "",
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StockMovementModal({ isOpen, onClose, editingMovement, defaultType = "STOCK_IN" }: StockMovementModalProps) {
  const queryClient        = useQueryClient();
  const { permissions }    = useAuth();
  const { activeBranchId } = useBranch();
  const isEditMode         = editingMovement !== null;
  const isOrgLevel         = permissions?.isOrgLevel ?? false;

  const [movementType, setMovementType] = useState<MovementType>("STOCK_IN");
  const [branchId, setBranchId]         = useState("");
  const [rows, setRows]                 = useState<StockInRow[]>([createEmptyRow()]);
  const [notes, setNotes]               = useState("");

  // ── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      if (isEditMode && editingMovement) {
        setMovementType(editingMovement.type);
        setBranchId(editingMovement.branch_id);
        setNotes(editingMovement.notes ?? "");
        setRows(
          editingMovement.items.map((item) => ({
            id:             generateRowId(),
            product_id:     item.product_id,
            sku:            item.sku,
            batch_number:   item.batch_number,
            expiry_date:    item.expiry_date,
            quantity:       item.quantity,
            margin:         0,
            purchase_price: item.purchase_price,
            selling_price:  item.selling_price,
            reason:         item.reason ?? "",
          })),
        );
      } else {
        setMovementType(defaultType);
        setBranchId("");
        setRows([createEmptyRow()]);
        setNotes("");
      }
    }
  }, [isOpen, isEditMode, editingMovement]);

  // ── Data queries ───────────────────────────────────────────────────────────

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-select"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 200 }),
    enabled:   isOpen && isOrgLevel,
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

  const { data: categoriesData = [] } = useQuery<ProductCategory[]>({
    queryKey:  ["categories"],
    queryFn:   () => apiGet<ProductCategory[]>("/products/categories"),
    enabled:   isOpen,
    staleTime: 5 * 60 * 1000,
  });

  function getCategoryMargin(productId: string): number {
    const product = products.find((p) => p.id === productId);
    if (!product) return 0;
    const category = categoriesData.find((c) => c.id === product.category_id);
    return category?.effective_margin_percentage ?? 0;
  }

  const { data: inventoryData } = useQuery<PaginatedResponse<InventoryItem>>({
    queryKey:  ["inventory-for-stock-out", activeBranchId],
    queryFn:   () => apiGet<PaginatedResponse<InventoryItem>>("/inventory", { branch_id: activeBranchId, page_size: 500 }),
    enabled:   isOpen && movementType === "STOCK_OUT",
    staleTime: 2 * 60 * 1000,
  });
  const inventoryItems = inventoryData?.data ?? [];

  function getBatchOptions(productId: string) {
    const inv = inventoryItems.find((i) => i.product_id === productId);
    if (!inv) return [];
    return inv.batches.filter((b) => b.quantity > 0).map((b) => ({
      value: b.batch_number,
      label: `${b.batch_number} (Qty: ${formatQuantity(b.quantity)}, Exp: ${b.expiry_date})`,
      batch: b,
    }));
  }

  function handleMarginChange(rowId: string, marginValue: number, sellingPrice: number) {
    const buyPrice = sellingPrice > 0 ? parseFloat((sellingPrice * (1 - marginValue / 100)).toFixed(2)) : 0;
    updateRow(rowId, { margin: marginValue, purchase_price: buyPrice });
  }

  function handleSellingPriceChangeWithMargin(rowId: string, sp: number, margin: number) {
    const buyPrice = sp > 0 && margin > 0 ? parseFloat((sp * (1 - margin / 100)).toFixed(2)) : 0;
    updateRow(rowId, { selling_price: sp, purchase_price: buyPrice });
  }

  function handleBuyPriceOverride(rowId: string, buyPrice: number, sellingPrice: number) {
    const margin = sellingPrice > 0 ? parseFloat(((1 - buyPrice / sellingPrice) * 100).toFixed(2)) : 0;
    updateRow(rowId, { purchase_price: buyPrice, margin });
  }

  // ── Row helpers ────────────────────────────────────────────────────────────

  const updateRow = useCallback((rowId: string, updates: Partial<StockInRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...updates } : r)));
  }, []);

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== rowId) : prev));
  }

  // ── SKU helpers ────────────────────────────────────────────────────────────

  function getSkuOptions(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return [];
    return [
      { value: product.basic_sku_name, label: `${product.basic_sku_name} (Basic)` },
      ...product.sku_mappings.map((m) => ({
        value: m.sku,
        label: `${m.sku} (${m.basic_sku_count} ${product.basic_sku_name}${m.basic_sku_count > 1 ? "s" : ""})`,
      })),
    ];
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (isOrgLevel && !branchId) return "Branch is required";

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.product_id)    return `Row ${i + 1}: Product is required`;
      if (!r.batch_number)  return `Row ${i + 1}: Batch number is required`;
      if (!r.expiry_date)   return `Row ${i + 1}: Expiry date is required`;
      if (r.quantity < 1)   return `Row ${i + 1}: Quantity must be at least 1`;

      if (movementType === "STOCK_IN") {
        if (r.selling_price <= 0) return `Row ${i + 1}: Selling price is required`;
      }

      if (movementType === "STOCK_OUT") {
        if (!r.reason) return `Row ${i + 1}: Reason is required`;
      }
    }

    return null;
  }

  // ── Build payload ──────────────────────────────────────────────────────────

  function buildPayload() {
    const items = rows.map((r) => {
      const product = products.find((p) => p.id === r.product_id);
      const productName = product?.name ?? "";

      const baseItem: Record<string, unknown> = {
        product_id:   r.product_id,
        product_name: productName,
        batch_number: r.batch_number,
        expiry_date:  r.expiry_date,
        quantity:     r.quantity,
      };

      if (movementType === "STOCK_IN") {
        baseItem.sku            = r.sku;
        baseItem.purchase_price = r.purchase_price;
        baseItem.selling_price  = r.selling_price;
      }

      if (movementType === "STOCK_OUT") {
        baseItem.reason = r.reason;
      }

      return baseItem;
    });

    return {
      type:      movementType,
      branch_id: branchId || activeBranchId || undefined,
      items,
      notes:     notes || undefined,
    };
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload();
      if (isEditMode && editingMovement) {
        return apiPut(`/stock-movements/${editingMovement.id}`, payload);
      }
      return apiPost("/stock-movements", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      showToast(
        "success",
        isEditMode ? "Stock Movement Updated" : "Stock Movement Created",
        `${rows.length} item${rows.length > 1 ? "s" : ""} ${isEditMode ? "updated" : "created"} successfully.`,
      );
      onClose();
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Operation Failed", err?.message ?? "Something went wrong.");
    },
  });

  function handleSubmit() {
    const error = validate();
    if (error) {
      showToast("error", "Validation Error", error);
      return;
    }
    mutation.mutate();
  }

  // ── Render — Stock In table ────────────────────────────────────────────────

  function renderStockInTable() {
    return (
      <div className="rounded-xl border" style={{ borderColor: "var(--color-border)", overflow: "visible" }}>
        <table className="w-full" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "24px" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "28px" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--color-table-header)" }}>
              {["#", "Product", "SKU", "Batch #", "Expiry", "Qty", "Sell", "Margin", "Buy", ""].map((h) => (
                <th key={h} className="px-1.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t align-top" style={{ borderColor: "var(--color-border)" }}>
                <td className="px-1.5 py-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{index + 1}</td>
                <td className="px-1 py-1 relative" style={{ overflow: "visible" }}>
                  <Autocomplete options={productOptions} value={row.product_id}
                    onChange={(val) => {
                      const prod = products.find((p) => p.id === val);
                      const margin = getCategoryMargin(val);
                      updateRow(row.id, { product_id: val, sku: prod?.basic_sku_name ?? "", margin });
                    }} placeholder="Product..." />
                </td>
                <td className="px-1 py-1">
                  <select className="form-select text-xs w-full" value={row.sku}
                    onChange={(e) => updateRow(row.id, { sku: e.target.value })}>
                    <option value="">...</option>
                    {getSkuOptions(row.product_id).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input type="text" className="form-input text-xs w-full" placeholder="Batch"
                    value={row.batch_number} onChange={(e) => updateRow(row.id, { batch_number: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <input type="date" className="form-input text-xs w-full" value={row.expiry_date}
                    onChange={(e) => updateRow(row.id, { expiry_date: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <FormattedInput value={row.quantity} onChange={(v) => updateRow(row.id, { quantity: v })}
                    format="quantity" placeholder="1" className="text-xs w-full" min={1} />
                </td>
                <td className="px-1 py-1">
                  <FormattedInput value={row.selling_price} onChange={(v) => handleSellingPriceChangeWithMargin(row.id, v, row.margin)}
                    format="amount" placeholder="0.00" className="text-xs w-full" />
                </td>
                <td className="px-1 py-1">
                  <FormattedInput value={row.margin} onChange={(v) => handleMarginChange(row.id, v, row.selling_price)}
                    format="percentage" placeholder="%" className="text-xs w-full" />
                </td>
                <td className="px-1 py-1">
                  <FormattedInput value={row.purchase_price} onChange={(v) => handleBuyPriceOverride(row.id, v, row.selling_price)}
                    format="amount" placeholder="0.00" className="text-xs w-full" />
                </td>
                <td className="px-1 py-1.5 text-center">
                  <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1}
                    className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors disabled:opacity-30">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Render — Stock Out table ───────────────────────────────────────────────

  function renderStockOutTable() {
    return (
      <div className="rounded-xl border" style={{ borderColor: "var(--color-border)", overflow: "visible" }}>
        <table className="w-full" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "24px" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "28px" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--color-table-header)" }}>
              {["#", "Product", "Batch", "Expiry", "Qty", "Sell", "Buy", "Reason", ""].map((h) => (
                <th key={h} className="px-1.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const batchOptions = getBatchOptions(row.product_id);
              return (
                <tr key={row.id} className="border-t align-top" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-1.5 py-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{index + 1}</td>
                  <td className="px-1 py-1 relative" style={{ overflow: "visible" }}>
                    <Autocomplete options={productOptions} value={row.product_id}
                      onChange={(val) => updateRow(row.id, { product_id: val, batch_number: "", expiry_date: "", quantity: 1, selling_price: 0, purchase_price: 0, sku: "" })}
                      placeholder="Product..." />
                  </td>
                  <td className="px-1 py-1">
                    <select className="form-select text-xs w-full" value={row.batch_number}
                      onChange={(e) => {
                        const selected = batchOptions.find((b) => b.value === e.target.value);
                        if (selected) {
                          updateRow(row.id, {
                            batch_number: selected.batch.batch_number, expiry_date: selected.batch.expiry_date,
                            quantity: selected.batch.quantity, selling_price: selected.batch.basic_sku_selling_price,
                            purchase_price: selected.batch.basic_sku_purchase_price, sku: selected.batch.basic_sku || "",
                          });
                        } else {
                          updateRow(row.id, { batch_number: "" });
                        }
                      }}>
                      <option value="">Batch...</option>
                      {batchOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5 text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                    {row.expiry_date || "—"}
                  </td>
                  <td className="px-1 py-1">
                    <FormattedInput value={row.quantity} onChange={(v) => updateRow(row.id, { quantity: v })}
                      format="quantity" placeholder="1" className="text-xs w-full" min={1} />
                  </td>
                  <td className="px-1.5 py-1.5 text-xs text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                    {row.selling_price ? formatAmount(row.selling_price) : "—"}
                  </td>
                  <td className="px-1.5 py-1.5 text-xs text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                    {row.purchase_price ? formatAmount(row.purchase_price) : "—"}
                  </td>
                  <td className="px-1 py-1">
                    <select className="form-select text-xs w-full" value={row.reason}
                      onChange={(e) => updateRow(row.id, { reason: e.target.value })}>
                      <option value="">Reason...</option>
                      {STOCK_OUT_REASON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1}
                      className="p-1 rounded text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors disabled:opacity-30">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? "Edit Stock Movement" : movementType === "STOCK_IN" ? "New Stock In" : "New Stock Out"}
      size="half"
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
            {isEditMode ? "Update Movement" : "Create Movement"} ({rows.length} item{rows.length > 1 ? "s" : ""})
          </Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Type selector */}
        <div>
          <label className="form-label">
            Type <span className="text-danger-500">*</span>
          </label>
          <div className="flex items-center gap-4 mt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="movementType"
                value="STOCK_IN"
                checked={movementType === "STOCK_IN"}
                onChange={() => setMovementType("STOCK_IN")}
                disabled={isEditMode}
                className="form-radio"
              />
              <span
                className="text-sm font-medium"
                style={{ color: isEditMode ? "var(--color-text-muted)" : "var(--color-text)" }}
              >
                Stock In
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="movementType"
                value="STOCK_OUT"
                checked={movementType === "STOCK_OUT"}
                onChange={() => setMovementType("STOCK_OUT")}
                disabled={isEditMode}
                className="form-radio"
              />
              <span
                className="text-sm font-medium"
                style={{ color: isEditMode ? "var(--color-text-muted)" : "var(--color-text)" }}
              >
                Stock Out
              </span>
            </label>
          </div>
        </div>

        {/* Branch selector for org-level users */}
        {isOrgLevel && (
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

        {/* Add item button */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Items ({rows.length})
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={addRow}
          >
            Add Item
          </Button>
        </div>

        {/* Table — conditional on type */}
        {movementType === "STOCK_IN" ? renderStockInTable() : renderStockOutTable()}

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            rows={3}
            placeholder="Optional notes..."
            className="form-input resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

      </div>
    </Modal>
  );
}
