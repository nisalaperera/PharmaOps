"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Search, Plus, Minus, X,
  User, AlertCircle, Stethoscope, ClipboardList,
} from "lucide-react";
import { Button }  from "@/components/ui/Button";
import { Input }   from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPost } from "@/lib/api-client";
import { showToast }        from "@/lib/toast";
import { ReceiptModal } from "@/app/(pages)/sales/pos/components/ReceiptModal";
import type {
  InventoryItem, Customer, Patient, Prescription, Sale, SalesOrder,
  Branch, PaginatedResponse, PaymentMethod,
} from "@/types";

// ─── Client-only cart type ────────────────────────────────────────────────────

interface CartLineItem {
  inventoryId:  string;
  productId:    string;
  productName:  string;
  batchNumber:  string;
  expiryDate:   string;
  unitPrice:    number;
  maxQty:       number;
  quantity:     number;
  discount:     number;
  prescriptionId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lineTotal(item: CartLineItem): number {
  return item.quantity * item.unitPrice - item.discount;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH",          label: "Cash"     },
  { value: "CARD",          label: "Card"     },
  { value: "BANK_TRANSFER", label: "Bank"     },
  { value: "CREDIT",        label: "Credit"   },
  { value: "CHEQUE",        label: "Cheque"   },
];

type PosMode = "SALE" | "ORDER";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PosPage() {
  const { user, permissions } = useAuth();
  const queryClient           = useQueryClient();

  // Mode toggle
  const [posMode, setPosMode] = useState<PosMode>("SALE");

  // Branch
  const [selectedBranchId, setSelectedBranchId] = useState<string>(user?.branchId ?? "");
  const effectiveBranchId = permissions?.isOrgLevel ? selectedBranchId : (user?.branchId ?? "");

  // Cart
  const [cart, setCart] = useState<CartLineItem[]>([]);

  // Product search
  const [productSearch,   setProductSearch]   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchFocused,   setSearchFocused]   = useState(false);

  // Customer
  const [customerId,               setCustomerId]               = useState<string>("");
  const [selectedCustomer,         setSelectedCustomer]         = useState<Customer | null>(null);
  const [customerSearch,           setCustomerSearch]           = useState<string>("");
  const [debouncedCustomerSearch,  setDebouncedCustomerSearch]  = useState<string>("");
  const [customerDropdownOpen,     setCustomerDropdownOpen]     = useState(false);

  // Patient profile (for prescription)
  const [patientProfileId,         setPatientProfileId]         = useState<string>("");

  // Prescription
  const [prescriptionId, setPrescriptionId] = useState<string>("");

  // Order notes (Order mode only)
  const [orderNotes, setOrderNotes] = useState("");

  // Payment
  const [paymentMethod,  setPaymentMethod]  = useState<PaymentMethod>("CASH");
  const [paidAmount,     setPaidAmount]     = useState<string>("");
  const [chequeNumber,   setChequeNumber]   = useState("");
  const [bankName,       setBankName]       = useState("");
  const [clearanceDate,  setClearanceDate]  = useState("");

  // Receipt
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // ── Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(productSearch), 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerSearch(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  // ── Computed totals
  const subtotal      = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountTotal = cart.reduce((s, i) => s + i.discount, 0);
  const total         = subtotal - discountTotal;

  // Auto-fill paidAmount for non-cash methods
  useEffect(() => {
    if (paymentMethod !== "CASH") {
      setPaidAmount(total.toFixed(2));
    }
  }, [paymentMethod, total]);

  const paidNum = parseFloat(paidAmount || "0");
  const change  = paymentMethod === "CASH" ? Math.max(0, paidNum - total) : 0;

  // ── Queries

  const { data: branchesData } = useQuery({
    queryKey:  ["pos-branches"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: true, page_size: 100 }),
    enabled:   permissions?.isOrgLevel ?? false,
    staleTime: 5 * 60_000,
  });
  const branches = branchesData?.data ?? [];

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ["pos-inventory", debouncedSearch, effectiveBranchId],
    queryFn:  () => apiGet<PaginatedResponse<InventoryItem>>("/inventory", {
      search:    debouncedSearch,
      branch_id: effectiveBranchId || undefined,
      page_size: 8,
    }),
    enabled:   debouncedSearch.length >= 2,
    staleTime: 30_000,
  });
  const inventoryResults = (inventoryData?.data ?? []).filter(i => i.total_quantity > 0);

  const { data: customersData } = useQuery({
    queryKey: ["pos-customers", debouncedCustomerSearch],
    queryFn:  () => apiGet<PaginatedResponse<Customer>>("/customers", {
      search:    debouncedCustomerSearch,
      is_active: true,
      page_size: 10,
    }),
    enabled:   debouncedCustomerSearch.length >= 2,
    staleTime: 60_000,
  });
  const customerResults = customersData?.data ?? [];

  const { data: patientProfilesData } = useQuery({
    queryKey: ["pos-patient-profiles", customerId],
    queryFn:  () => apiGet<PaginatedResponse<Patient>>("/patients", {
      customer_id: customerId,
      is_active:   true,
      page_size:   50,
    }),
    enabled:   !!customerId,
    staleTime: 60_000,
  });
  const patientProfiles = patientProfilesData?.data ?? [];

  const { data: prescriptionsData } = useQuery({
    queryKey: ["pos-prescriptions", patientProfileId],
    queryFn:  () => apiGet<PaginatedResponse<Prescription>>("/prescriptions", {
      patient_id: patientProfileId,
      is_active:  true,
      page_size:  50,
    }),
    enabled:   !!patientProfileId,
    staleTime: 60_000,
  });
  const prescriptions = prescriptionsData?.data ?? [];

  // ── Sale mutation (SALE mode)

  const saleMutation = useMutation({
    mutationFn: (payload: object) => apiPost<Sale>("/sales/invoices", payload),
    onSuccess: (sale) => {
      setCompletedSale(sale);
      resetCart();
      queryClient.invalidateQueries({ queryKey: ["pos-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Sale Failed", err?.message ?? "Could not process the sale. Please try again.");
    },
  });

  // ── Order mutation (ORDER mode)

  const orderMutation = useMutation({
    mutationFn: (payload: object) => apiPost<SalesOrder>("/sales/orders", payload),
    onSuccess: () => {
      showToast("success", "Order Saved", "Sales order has been saved as a draft.");
      resetCart();
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    },
    onError: (err: { message?: string }) => {
      showToast("error", "Order Failed", err?.message ?? "Could not save the order. Please try again.");
    },
  });

  // ── Cart operations

  function resetCart() {
    setCart([]);
    setCustomerId("");
    setSelectedCustomer(null);
    setCustomerSearch("");
    setPatientProfileId("");
    setPrescriptionId("");
    setPaymentMethod("CASH");
    setPaidAmount("");
    setChequeNumber("");
    setBankName("");
    setClearanceDate("");
    setOrderNotes("");
  }

  function addToCart(inv: InventoryItem) {
    const available = inv.batches
      .filter(b => b.quantity > 0)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));

    if (!available.length) {
      showToast("error", "Out of Stock", `${inv.product_name} has no available stock.`);
      return;
    }

    const batch = available[0];
    const existIdx = cart.findIndex(
      c => c.productId === inv.product_id && c.batchNumber === batch.batch_number
    );

    if (existIdx >= 0) {
      const existing = cart[existIdx];
      if (existing.quantity >= existing.maxQty) {
        showToast("error", "Max Stock Reached", `Only ${existing.maxQty} unit(s) available.`);
        return;
      }
      setCart(prev => prev.map((item, i) =>
        i === existIdx ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart(prev => [...prev, {
        inventoryId:   inv.id,
        productId:     inv.product_id,
        productName:   inv.product_name,
        batchNumber:   batch.batch_number,
        expiryDate:    batch.expiry_date,
        unitPrice:     batch.selling_price,
        maxQty:        batch.quantity,
        quantity:      1,
        discount:      0,
        prescriptionId: prescriptionId || undefined,
      }]);
    }

    setProductSearch("");
  }

  function updateQty(index: number, qty: number) {
    setCart(prev => prev.map((item, i) =>
      i === index ? { ...item, quantity: Math.min(Math.max(1, qty), item.maxQty) } : item
    ));
  }

  function updateDiscount(index: number, discount: number) {
    setCart(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const cap = item.quantity * item.unitPrice;
      return { ...item, discount: Math.min(Math.max(0, discount), cap) };
    }));
  }

  function removeItem(index: number) {
    setCart(prev => prev.filter((_, i) => i !== index));
  }

  // ── Checkout (SALE mode)

  function handleCheckout() {
    if (!effectiveBranchId) {
      showToast("error", "No Branch Selected", "Please select a branch to continue.");
      return;
    }
    if (cart.length === 0) {
      showToast("error", "Empty Cart", "Add at least one item to the cart.");
      return;
    }
    if (paymentMethod === "CREDIT" && !customerId) {
      showToast("error", "Customer Required", "Credit sales require a customer to be selected.");
      return;
    }
    if (paymentMethod === "CASH" && paidNum < total) {
      showToast("error", "Insufficient Payment", `Paid amount must be at least ${total.toFixed(2)}.`);
      return;
    }
    if (paymentMethod === "CHEQUE" && (!chequeNumber || !bankName || !clearanceDate)) {
      showToast("error", "Cheque Details Required", "Fill in cheque number, bank name, and clearance date.");
      return;
    }
    if (paymentMethod === "CREDIT" && selectedCustomer) {
      const available = selectedCustomer.credit_limit - selectedCustomer.outstanding_balance;
      if (total > available) {
        showToast("error", "Credit Limit Exceeded", `Available credit: ${available.toFixed(2)}`);
        return;
      }
    }

    saleMutation.mutate({
      branch_id:      effectiveBranchId,
      customer_id:    customerId || undefined,
      payment_method: paymentMethod,
      paid_amount:    paymentMethod === "CASH" ? paidNum : total,
      cheque_details: paymentMethod === "CHEQUE" ? {
        cheque_number:  chequeNumber,
        bank_name:      bankName,
        clearance_date: clearanceDate,
      } : undefined,
      items: cart.map(item => ({
        product_id:      item.productId,
        product_name:    item.productName,
        batch_number:    item.batchNumber,
        quantity:        item.quantity,
        unit_price:      item.unitPrice,
        discount:        item.discount,
        total_price:     lineTotal(item),
        prescription_id: item.prescriptionId || undefined,
      })),
    });
  }

  // ── Save Order (ORDER mode)

  function handleSaveOrder() {
    if (!effectiveBranchId) {
      showToast("error", "No Branch Selected", "Please select a branch to continue.");
      return;
    }
    if (cart.length === 0) {
      showToast("error", "Empty Cart", "Add at least one item to the order.");
      return;
    }

    orderMutation.mutate({
      branch_id:   effectiveBranchId,
      customer_id: customerId || undefined,
      notes:       orderNotes || undefined,
      items: cart.map(item => ({
        product_id:      item.productId,
        product_name:    item.productName,
        quantity:        item.quantity,
        unit_price:      item.unitPrice,
        discount:        item.discount,
        total_price:     lineTotal(item),
        prescription_id: item.prescriptionId || undefined,
      })),
    });
  }

  const creditRemaining = selectedCustomer
    ? selectedCustomer.credit_limit - selectedCustomer.outstanding_balance
    : null;
  const creditOk = creditRemaining === null || total <= creditRemaining;

  const isPending = saleMutation.isPending || orderMutation.isPending;

  // ── Render

  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>

      {/* ── LEFT: Search + Cart ───────────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col overflow-hidden border-r"
        style={{ borderColor: "var(--color-border)" }}
      >

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" style={{ color: "var(--color-text-muted)" }} />
              <h1 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>Point of Sale</h1>
            </div>

            {/* Mode toggle */}
            <div
              className="flex items-center rounded-lg p-0.5 gap-0.5"
              style={{ background: "var(--color-surface-2)" }}
            >
              <button
                onClick={() => { setPosMode("SALE"); setCart([]); setOrderNotes(""); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  posMode === "SALE"
                    ? "bg-primary-500 text-white shadow-sm"
                    : "hover:bg-[var(--color-surface)]"
                }`}
                style={{ color: posMode === "SALE" ? undefined : "var(--color-text-muted)" }}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Sale
              </button>
              <button
                onClick={() => { setPosMode("ORDER"); setCart([]); setPaymentMethod("CASH"); setPaidAmount(""); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  posMode === "ORDER"
                    ? "bg-primary-500 text-white shadow-sm"
                    : "hover:bg-[var(--color-surface)]"
                }`}
                style={{ color: posMode === "ORDER" ? undefined : "var(--color-text-muted)" }}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Order
              </button>
            </div>
          </div>

          {permissions?.isOrgLevel ? (
            <select
              value={selectedBranchId}
              onChange={(e) => { setSelectedBranchId(e.target.value); setCart([]); }}
              className="form-select text-sm w-44"
            >
              <option value="">— Select Branch —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : (
            <span className="text-xs font-medium px-2 py-1 rounded" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-2)" }}>
              Branch Terminal
            </span>
          )}
        </div>

        {/* Product search */}
        <div
          className="px-5 py-3 border-b flex-shrink-0 relative"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Input
            placeholder="Search product by name or SKU…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            leftIcon={<Search className="w-4 h-4" />}
          />

          {searchFocused && debouncedSearch.length >= 2 && (
            <div
              className="absolute left-5 right-5 top-[calc(100%-4px)] z-30 rounded-xl shadow-xl border overflow-hidden"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              {inventoryLoading && (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>Searching…</p>
              )}
              {!inventoryLoading && inventoryResults.length === 0 && (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No in-stock products matching &ldquo;{debouncedSearch}&rdquo;
                </p>
              )}
              {inventoryResults.map(inv => {
                const batch = inv.batches
                  .filter(b => b.quantity > 0)
                  .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0];
                return (
                  <button
                    key={inv.id}
                    onMouseDown={() => addToCart(inv)}
                    className="w-full flex items-center justify-between px-4 py-3 border-b last:border-0 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{inv.product_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                        Batch: {batch?.batch_number} · Exp: {batch?.expiry_date} · Stock: {inv.total_quantity}
                      </p>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                        {batch?.selling_price.toFixed(2)}
                      </p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>per unit</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart header */}
        <div
          className="flex items-center justify-between px-5 py-2 border-b flex-shrink-0"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            {posMode === "ORDER" ? "Order Items" : "Cart"} {cart.length > 0 && `· ${cart.length} item${cart.length !== 1 ? "s" : ""}`}
          </span>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-danger-500 hover:underline">
              Clear all
            </button>
          )}
        </div>

        {/* Cart body */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              {posMode === "ORDER" ? (
                <ClipboardList className="w-14 h-14 mb-4 opacity-10" style={{ color: "var(--color-text-muted)" }} />
              ) : (
                <ShoppingCart className="w-14 h-14 mb-4 opacity-10" style={{ color: "var(--color-text-muted)" }} />
              )}
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Search above to add products</p>
            </div>
          ) : (
            <div>
              {/* Cart column headers */}
              <div
                className="grid text-xs font-semibold uppercase tracking-wider px-5 py-2 border-b sticky top-0"
                style={{
                  gridTemplateColumns: "1fr 90px 90px 90px 76px 28px",
                  color: "var(--color-text-muted)",
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface-2)",
                }}
              >
                <span>Product</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Discount</span>
                <span className="text-right">Total</span>
                <span />
              </div>

              {cart.map((item, idx) => (
                <div
                  key={idx}
                  className="grid items-center gap-2 px-5 py-3 border-b"
                  style={{
                    gridTemplateColumns: "1fr 90px 90px 90px 76px 28px",
                    borderColor: "var(--color-border)",
                  }}
                >
                  {/* Product info */}
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{item.productName}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {item.batchNumber} · Exp {item.expiryDate}
                    </p>
                  </div>

                  {/* Qty stepper */}
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => updateQty(idx, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-30"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={item.maxQty}
                      value={item.quantity}
                      onChange={(e) => updateQty(idx, parseInt(e.target.value) || 1)}
                      className="w-8 text-center text-sm font-medium bg-transparent border-0 outline-none tabular-nums"
                      style={{ color: "var(--color-text)" }}
                    />
                    <button
                      onClick={() => updateQty(idx, item.quantity + 1)}
                      disabled={item.quantity >= item.maxQty}
                      className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-30"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Unit price */}
                  <p className="text-sm text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                    {item.unitPrice.toFixed(2)}
                  </p>

                  {/* Discount */}
                  <div className="flex justify-end">
                    <input
                      type="number"
                      min={0}
                      max={item.quantity * item.unitPrice}
                      step={0.01}
                      value={item.discount || ""}
                      placeholder="0.00"
                      onChange={(e) => updateDiscount(idx, parseFloat(e.target.value) || 0)}
                      className="w-20 text-sm text-right bg-transparent border-b focus:border-primary-500 outline-none tabular-nums"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                    />
                  </div>

                  {/* Line total */}
                  <p className="text-sm font-semibold text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                    {lineTotal(item).toFixed(2)}
                  </p>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(idx)}
                    className="flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-danger-50 dark:hover:bg-danger-900/20"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Checkout / Order panel ────────────────────────────────────── */}
      <div
        className="w-80 flex flex-col overflow-y-auto flex-shrink-0"
        style={{ background: "var(--color-surface)" }}
      >

        {/* Customer */}
        <div className="p-4 border-b space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            Customer {posMode === "ORDER" && <span className="text-primary-400 normal-case ml-1">(optional)</span>}
          </p>

          {selectedCustomer ? (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: "var(--color-surface-2)" }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{selectedCustomer.full_name}</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{selectedCustomer.phone}</p>
              </div>
              <button
                onClick={() => {
                  setCustomerId(""); setSelectedCustomer(null); setCustomerSearch("");
                  setPatientProfileId(""); setPrescriptionId("");
                }}
                className="p-1"
              >
                <X className="w-3.5 h-3.5" style={{ color: "var(--color-text-muted)" }} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Search customer…"
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); setCustomerDropdownOpen(true); }}
                onFocus={() => setCustomerDropdownOpen(true)}
                onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 200)}
                leftIcon={<User className="w-3.5 h-3.5" />}
              />
              {customerDropdownOpen && debouncedCustomerSearch.length >= 2 && customerResults.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl shadow-xl border overflow-hidden max-h-44 overflow-y-auto"
                  style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
                >
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={() => {
                        setCustomerId(c.id);
                        setSelectedCustomer(c);
                        setCustomerSearch("");
                        setCustomerDropdownOpen(false);
                      }}
                      className="w-full flex items-start px-3 py-2 border-b last:border-0 hover:bg-[var(--color-surface-2)] transition-colors text-left"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{c.full_name}</p>
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Patient profile selector (for prescriptions) */}
          {customerId && patientProfiles.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                <Stethoscope className="w-3 h-3 inline mr-1" />
                Patient Profile
              </p>
              <select
                value={patientProfileId}
                onChange={(e) => { setPatientProfileId(e.target.value); setPrescriptionId(""); }}
                className="form-select w-full text-sm"
              >
                <option value="">No patient profile</option>
                {patientProfiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.relationship})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Prescription selector */}
          {patientProfileId && prescriptions.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                Prescription (optional)
              </p>
              <select
                value={prescriptionId}
                onChange={(e) => setPrescriptionId(e.target.value)}
                className="form-select w-full text-sm"
              >
                <option value="">No prescription</option>
                {prescriptions.map(rx => (
                  <option key={rx.id} value={rx.id}>
                    {rx.doctor_name} · {rx.prescription_date}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Credit info (SALE mode only) */}
          {posMode === "SALE" && paymentMethod === "CREDIT" && selectedCustomer && (
            <div
              className={`rounded-lg px-3 py-2 text-xs space-y-0.5 ${!creditOk ? "border border-danger-500" : ""}`}
              style={{ background: "var(--color-surface-2)" }}
            >
              {!creditOk && (
                <div className="flex items-center gap-1 text-danger-500 font-semibold mb-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Credit limit exceeded
                </div>
              )}
              <p style={{ color: "var(--color-text-muted)" }}>
                Limit: <strong style={{ color: "var(--color-text)" }}>{selectedCustomer.credit_limit.toFixed(2)}</strong>
              </p>
              <p style={{ color: "var(--color-text-muted)" }}>
                Outstanding:{" "}
                <strong style={{ color: selectedCustomer.outstanding_balance > 0 ? "#ef4444" : "var(--color-text)" }}>
                  {selectedCustomer.outstanding_balance.toFixed(2)}
                </strong>
              </p>
              <p style={{ color: "var(--color-text-muted)" }}>
                Available:{" "}
                <strong style={{ color: creditOk ? "#10b981" : "#ef4444" }}>
                  {(creditRemaining ?? 0).toFixed(2)}
                </strong>
              </p>
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
            {posMode === "ORDER" ? "Order Summary" : "Order Summary"}
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Subtotal</span>
              <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{subtotal.toFixed(2)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--color-text-muted)" }}>Discount</span>
                <span className="tabular-nums text-danger-500">-{discountTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="h-px my-1" style={{ background: "var(--color-border)" }} />
            <div className="flex justify-between font-bold text-base">
              <span style={{ color: "var(--color-text)" }}>Total</span>
              <span className="tabular-nums" style={{ color: "var(--color-text)" }}>{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ORDER mode: Notes */}
        {posMode === "ORDER" && (
          <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--color-text-muted)" }}>
              Notes (optional)
            </label>
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Add any notes for this order…"
              rows={3}
              className="form-input w-full resize-none text-sm"
            />
          </div>
        )}

        {/* SALE mode: Payment method */}
        {posMode === "SALE" && (
          <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
              Payment Method
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.map(pm => (
                <button
                  key={pm.value}
                  onClick={() => setPaymentMethod(pm.value)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    paymentMethod === pm.value
                      ? "bg-primary-500 text-white shadow-sm"
                      : "hover:bg-[var(--color-surface-2)]"
                  }`}
                  style={{ color: paymentMethod === pm.value ? undefined : "var(--color-text)" }}
                >
                  {pm.label}
                </button>
              ))}
            </div>

            {/* Cheque details */}
            {paymentMethod === "CHEQUE" && (
              <div className="mt-3 space-y-2">
                <input
                  placeholder="Cheque number"
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  className="form-input w-full text-sm"
                />
                <input
                  placeholder="Bank name"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="form-input w-full text-sm"
                />
                <input
                  type="date"
                  value={clearanceDate}
                  onChange={(e) => setClearanceDate(e.target.value)}
                  className="form-input w-full text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* SALE mode: Paid amount (CASH only) */}
        {posMode === "SALE" && paymentMethod === "CASH" && (
          <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--color-text-muted)" }}>
              Amount Received
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder={total.toFixed(2)}
              className="form-input w-full text-base font-semibold tabular-nums"
            />
            <div className="flex justify-between text-sm mt-2">
              <span style={{ color: "var(--color-text-muted)" }}>Change</span>
              <span
                className="font-bold tabular-nums"
                style={{ color: change > 0 ? "#10b981" : "var(--color-text)" }}
              >
                {change.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Action button */}
        <div className="p-4 mt-auto">
          {posMode === "SALE" ? (
            <Button
              variant="primary"
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              isLoading={isPending}
              disabled={cart.length === 0 || !effectiveBranchId}
            >
              Complete Sale · {total.toFixed(2)}
            </Button>
          ) : (
            <Button
              variant="primary"
              className="w-full"
              size="lg"
              onClick={handleSaveOrder}
              isLoading={isPending}
              disabled={cart.length === 0 || !effectiveBranchId}
              leftIcon={<ClipboardList className="w-4 h-4" />}
            >
              Save Order · {total.toFixed(2)}
            </Button>
          )}

          {!effectiveBranchId && (
            <p className="text-xs text-center mt-2 text-danger-500">Select a branch to proceed</p>
          )}
        </div>
      </div>

      {/* Receipt modal (SALE mode only) */}
      <ReceiptModal
        sale={completedSale}
        onClose={() => setCompletedSale(null)}
      />
    </div>
  );
}
