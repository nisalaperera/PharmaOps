"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, TrendingUp, Package, AlertTriangle,
  RefreshCw, FileDown, ShoppingCart, Archive,
} from "lucide-react";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import { Button } from "@/components/ui/Button";
import { Badge }  from "@/components/ui/Badge";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, downloadBlob } from "@/lib/api-client";
import { daysUntilExpiry, cn } from "@/lib/utils";
import type {
  SalesSummaryReport, StockValuationReport, StockValuationItem,
  ExpiryReport, ExpiryItem, Branch, PaginatedResponse,
} from "@/types";

// ─── Report tab config ────────────────────────────────────────────────────────

type ReportTab = "sales-summary" | "stock-valuation" | "expiry-report";

const REPORT_TABS: {
  id:    ReportTab;
  label: string;
  icon:  React.ComponentType<{ className?: string }>;
  desc:  string;
}[] = [
  { id: "sales-summary",   label: "Sales Summary",   icon: TrendingUp,    desc: "Revenue and payment breakdown"     },
  { id: "stock-valuation", label: "Stock Valuation",  icon: Package,       desc: "Inventory value by product"        },
  { id: "expiry-report",   label: "Expiry Report",    icon: AlertTriangle, desc: "Batches nearing or past expiry"    },
];

const DAYS_THRESHOLD_OPTIONS = [
  { value: 7,   label: "7 days"   },
  { value: 14,  label: "14 days"  },
  { value: 30,  label: "30 days"  },
  { value: 60,  label: "60 days"  },
  { value: 90,  label: "90 days"  },
  { value: 180, label: "6 months" },
];

const PAYMENT_LABELS: Record<string, string> = {
  CASH:          "Cash",
  CARD:          "Card",
  BANK_TRANSFER: "Bank Transfer",
  CREDIT:        "Credit",
  CHEQUE:        "Cheque",
};

// ─── Shared widgets ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub,
  icon: Icon,
  variant = "default",
}: {
  label:    string;
  value:    string | number;
  sub?:     string;
  icon?:    React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const iconBg: Record<string, string> = {
    default: "var(--color-surface-2)",
    success: "rgba(16,185,129,0.1)",
    warning: "rgba(245,158,11,0.1)",
    danger:  "rgba(239,68,68,0.1)",
  };
  const iconColor: Record<string, string> = {
    default: "var(--color-text-muted)",
    success: "rgb(16,185,129)",
    warning: "rgb(245,158,11)",
    danger:  "rgb(239,68,68)",
  };
  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-2xl"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {Icon && (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: iconBg[variant] }}
        >
          <Icon className="w-4 h-4" style={{ color: iconColor[variant] }} />
        </div>
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </p>
        <p className="text-2xl font-bold mt-0.5 tabular-nums" style={{ color: "var(--color-text)" }}>
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
      {children}
    </h3>
  );
}

function TableContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-auto border"
      style={{ borderColor: "var(--color-border)" }}
    >
      <table className="w-full text-sm whitespace-nowrap">
        {children}
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn("px-4 py-2.5 text-xs font-medium text-left", right && "text-right")}
      style={{ color: "var(--color-text-muted)", background: "var(--color-surface-2)" }}
    >
      {children}
    </th>
  );
}

function Td({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td
      className={cn("px-4 py-2.5", right && "text-right tabular-nums")}
      style={{ color: muted ? "var(--color-text-muted)" : "var(--color-text)" }}
    >
      {children}
    </td>
  );
}

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-3 rounded animate-pulse" style={{ background: "var(--color-surface-2)", width: j === 0 ? "70%" : "40%" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Expiry badge ─────────────────────────────────────────────────────────────

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0)   return <Badge variant="danger">Expired</Badge>;
  if (days <= 7)  return <Badge variant="danger">{days}d</Badge>;
  if (days <= 30) return <Badge variant="warning">{days}d</Badge>;
  return <Badge variant="default">{days}d left</Badge>;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function toCsvBlob(headers: string[], rows: string[][]): Blob {
  const text = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  return new Blob([text], { type: "text/csv;charset=utf-8;" });
}

function exportStockCsv(items: StockValuationItem[], branchNameMap: Record<string, string>) {
  const stamp = format(new Date(), "yyyy-MM-dd");
  const blob  = toCsvBlob(
    ["Product", "Branch", "Total Qty", "Inventory Value"],
    items.map((i) => [
      i.product_name,
      branchNameMap[i.branch_id] ?? i.branch_id,
      String(i.total_qty),
      i.value.toFixed(2),
    ]),
  );
  downloadBlob(blob, `stock_valuation_${stamp}.csv`);
}

function exportExpiryCsv(items: ExpiryItem[], branchNameMap: Record<string, string>) {
  const stamp = format(new Date(), "yyyy-MM-dd");
  const blob  = toCsvBlob(
    ["Product", "Branch", "Batch #", "Expiry Date", "Days Until Expiry", "Qty"],
    items.map((i) => {
      const days = daysUntilExpiry(i.expiry_date);
      return [
        i.product_name,
        branchNameMap[i.branch_id] ?? i.branch_id,
        i.batch_number,
        i.expiry_date,
        days < 0 ? "Expired" : String(days),
        String(i.quantity),
      ];
    }),
  );
  downloadBlob(blob, `expiry_report_${stamp}.csv`);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { permissions } = useAuth();

  const [activeTab,     setActiveTab]     = useState<ReportTab>("sales-summary");
  const [branchFilter,  setBranchFilter]  = useState("");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");
  const [daysThreshold, setDaysThreshold] = useState(30);

  // ─── Branches ──────────────────────────────────────────────────────────────

  const { data: branchesData } = useQuery<PaginatedResponse<Branch>>({
    queryKey:  ["branches-all"],
    queryFn:   () => apiGet<PaginatedResponse<Branch>>("/branches", { is_active: "true", page_size: 100 }),
    enabled:   permissions?.isOrgLevel ?? false,
    staleTime: 5 * 60 * 1000,
  });
  const allBranches   = branchesData?.data ?? [];
  const branchNameMap = Object.fromEntries(allBranches.map((b) => [b.id, b.name]));

  // ─── Sales Summary query ───────────────────────────────────────────────────

  const salesParams: Record<string, string> = {};
  if (branchFilter) salesParams.branch_id = branchFilter;
  if (dateFrom)     salesParams.date_from  = dateFrom;
  if (dateTo)       salesParams.date_to    = dateTo;

  const {
    data:       salesData,
    isLoading:  salesLoading,
    isFetching: salesFetching,
    refetch:    refetchSales,
  } = useQuery<SalesSummaryReport>({
    queryKey:  ["report-sales", branchFilter, dateFrom, dateTo],
    queryFn:   () => apiGet<SalesSummaryReport>("/reports/sales-summary", salesParams),
    enabled:   activeTab === "sales-summary",
    staleTime: 2 * 60 * 1000,
  });

  // ─── Stock Valuation query ─────────────────────────────────────────────────

  const stockParams: Record<string, string> = {};
  if (branchFilter) stockParams.branch_id = branchFilter;

  const {
    data:       stockData,
    isLoading:  stockLoading,
    isFetching: stockFetching,
    refetch:    refetchStock,
  } = useQuery<StockValuationReport>({
    queryKey:  ["report-stock", branchFilter],
    queryFn:   () => apiGet<StockValuationReport>("/reports/stock-valuation", stockParams),
    enabled:   activeTab === "stock-valuation",
    staleTime: 2 * 60 * 1000,
  });

  // ─── Expiry Report query ───────────────────────────────────────────────────

  const expiryParams: Record<string, string | number> = { days_threshold: daysThreshold };
  if (branchFilter) expiryParams.branch_id = branchFilter;

  const {
    data:       expiryData,
    isLoading:  expiryLoading,
    isFetching: expiryFetching,
    refetch:    refetchExpiry,
  } = useQuery<ExpiryReport>({
    queryKey:  ["report-expiry", branchFilter, daysThreshold],
    queryFn:   () => apiGet<ExpiryReport>("/reports/expiry-report", expiryParams),
    enabled:   activeTab === "expiry-report",
    staleTime: 2 * 60 * 1000,
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const isFetching = activeTab === "sales-summary"   ? salesFetching :
                     activeTab === "stock-valuation" ? stockFetching : expiryFetching;

  function handleRefresh() {
    if (activeTab === "sales-summary")   refetchSales();
    if (activeTab === "stock-valuation") refetchStock();
    if (activeTab === "expiry-report")   refetchExpiry();
  }

  // Quick date presets for Sales Summary
  function applyDatePreset(preset: "today" | "this-month" | "last-30" | "this-year" | "all") {
    const now = new Date();
    if (preset === "today") {
      const d = format(now, "yyyy-MM-dd");
      setDateFrom(d); setDateTo(d);
    } else if (preset === "this-month") {
      setDateFrom(format(startOfMonth(now), "yyyy-MM-dd"));
      setDateTo(format(now, "yyyy-MM-dd"));
    } else if (preset === "last-30") {
      setDateFrom(format(subDays(now, 29), "yyyy-MM-dd"));
      setDateTo(format(now, "yyyy-MM-dd"));
    } else if (preset === "this-year") {
      setDateFrom(format(startOfYear(now), "yyyy-MM-dd"));
      setDateTo(format(now, "yyyy-MM-dd"));
    } else {
      setDateFrom(""); setDateTo("");
    }
  }

  const avgSale = salesData && salesData.sale_count > 0
    ? salesData.total_amount / salesData.sale_count
    : 0;

  const paymentEntries = salesData
    ? Object.entries(salesData.payment_totals).sort(([, a], [, b]) => b - a)
    : [];

  const stockItems = stockData?.items ?? [];

  const expiryItems = expiryData?.expiring_items ?? [];

  return (
    <div className="page-container">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6" style={{ color: "var(--color-text-muted)" }} />
            <h1 className="page-title">Reports & Analytics</h1>
          </div>
          <p className="page-subtitle mt-1">Generate business insights and operational reports</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />}
          onClick={handleRefresh}
          disabled={isFetching}
        >
          Refresh
        </Button>
      </div>

      {/* ── Report type tabs ───────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 rounded-2xl"
        style={{ background: "var(--color-surface-2)" }}
      >
        {REPORT_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all",
                isActive ? "shadow-sm" : "hover:bg-[var(--color-surface)]/50"
              )}
              style={{
                background: isActive ? "var(--color-surface)" : undefined,
                color:      isActive ? "var(--color-text)" : "var(--color-text-muted)",
              }}
            >
              <tab.icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-primary-500")} />
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold truncate", isActive && "text-primary-500")}>
                  {tab.label}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                  {tab.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-end gap-3 px-4 py-3 rounded-2xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Branch — org-level only */}
        {permissions?.isOrgLevel && allBranches.length > 0 && (
          <div>
            <label className="form-label text-xs mb-1">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="form-select w-auto"
            >
              <option value="">All Branches</option>
              {allBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Sales Summary — date filters */}
        {activeTab === "sales-summary" && (
          <>
            <div>
              <label className="form-label text-xs mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="form-input w-auto"
              />
            </div>
            <div>
              <label className="form-label text-xs mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="form-input w-auto"
              />
            </div>
            {/* Quick presets */}
            <div className="flex flex-wrap items-end gap-1.5 pb-0.5">
              {(["today", "this-month", "last-30", "this-year", "all"] as const).map((p) => {
                const labels: Record<string, string> = {
                  today:      "Today",
                  "this-month": "This Month",
                  "last-30":  "Last 30d",
                  "this-year": "This Year",
                  all:        "All Time",
                };
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyDatePreset(p)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors border"
                    style={{
                      borderColor: "var(--color-border)",
                      color:       "var(--color-text-muted)",
                    }}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Expiry Report — days threshold */}
        {activeTab === "expiry-report" && (
          <div>
            <label className="form-label text-xs mb-1">Expiring within</label>
            <select
              value={daysThreshold}
              onChange={(e) => setDaysThreshold(Number(e.target.value))}
              className="form-select w-auto"
            >
              {DAYS_THRESHOLD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Report content ─────────────────────────────────────────────────── */}

      {/* ── Sales Summary ──────────────────────────────────────────────────── */}
      {activeTab === "sales-summary" && (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Total Revenue"
              value={salesLoading ? "—" : salesData ? salesData.total_amount.toFixed(2) : "—"}
              icon={ShoppingCart}
              variant="success"
            />
            <StatCard
              label="Transactions"
              value={salesLoading ? "—" : salesData ? salesData.sale_count.toLocaleString() : "—"}
              icon={Archive}
            />
            <StatCard
              label="Average Sale"
              value={salesLoading ? "—" : salesData ? avgSale.toFixed(2) : "—"}
              sub="per transaction"
            />
          </div>

          {/* Payment breakdown */}
          <div className="space-y-3">
            <SectionHeading>Payment Method Breakdown</SectionHeading>
            <TableContainer>
              <thead>
                <tr>
                  <Th>Payment Method</Th>
                  <Th right>Amount</Th>
                  <Th right>Share</Th>
                </tr>
              </thead>
              <tbody>
                {salesLoading ? (
                  <LoadingRows cols={3} />
                ) : paymentEntries.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No sales data for the selected period.
                    </td>
                  </tr>
                ) : (
                  paymentEntries.map(([method, amount]) => {
                    const share = salesData!.total_amount > 0
                      ? (amount / salesData!.total_amount) * 100
                      : 0;
                    return (
                      <tr key={method} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                        <Td>{PAYMENT_LABELS[method] ?? method}</Td>
                        <Td right>{amount.toFixed(2)}</Td>
                        <Td right muted>
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
                              <div className="h-full rounded-full bg-primary-500" style={{ width: `${share}%` }} />
                            </div>
                            <span>{share.toFixed(1)}%</span>
                          </div>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </TableContainer>
          </div>
        </div>
      )}

      {/* ── Stock Valuation ─────────────────────────────────────────────────── */}
      {activeTab === "stock-valuation" && (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Total Inventory Value"
              value={stockLoading ? "—" : stockData ? stockData.total_value.toFixed(2) : "—"}
              icon={Archive}
              variant="success"
            />
            <StatCard
              label="Products in Stock"
              value={stockLoading ? "—" : stockData ? stockData.item_count.toLocaleString() : "—"}
            />
            <StatCard
              label="Low Stock Items"
              value={stockLoading ? "—" : stockData ? stockData.low_stock_count.toLocaleString() : "—"}
              variant={stockData && stockData.low_stock_count > 0 ? "warning" : "default"}
            />
          </div>

          {/* Items table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionHeading>Inventory by Product ({stockItems.length})</SectionHeading>
              {stockItems.length > 0 && (
                <Button
                  variant="outline" size="sm"
                  leftIcon={<FileDown className="w-3.5 h-3.5" />}
                  onClick={() => exportStockCsv(stockItems, branchNameMap)}
                >
                  Export CSV
                </Button>
              )}
            </div>
            <TableContainer>
              <thead>
                <tr>
                  <Th>Product</Th>
                  {permissions?.isOrgLevel && <Th>Branch</Th>}
                  <Th right>Qty</Th>
                  <Th right>Value</Th>
                </tr>
              </thead>
              <tbody>
                {stockLoading ? (
                  <LoadingRows cols={permissions?.isOrgLevel ? 4 : 3} />
                ) : stockItems.length === 0 ? (
                  <tr>
                    <td colSpan={permissions?.isOrgLevel ? 4 : 3} className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No inventory data found.
                    </td>
                  </tr>
                ) : (
                  stockItems.map((item) => (
                    <tr key={item.product_id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <Td>{item.product_name || "—"}</Td>
                      {permissions?.isOrgLevel && (
                        <Td muted>{branchNameMap[item.branch_id] ?? item.branch_id}</Td>
                      )}
                      <Td right muted>{item.total_qty.toLocaleString()}</Td>
                      <Td right>{item.value.toFixed(2)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableContainer>
          </div>
        </div>
      )}

      {/* ── Expiry Report ───────────────────────────────────────────────────── */}
      {activeTab === "expiry-report" && (
        <div className="space-y-5">
          {/* Stat card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label={`Expiring within ${daysThreshold} days`}
              value={expiryLoading ? "—" : expiryData ? expiryData.expiring_count.toLocaleString() : "—"}
              icon={AlertTriangle}
              variant={expiryData && expiryData.expiring_count > 0 ? "warning" : "default"}
            />
          </div>

          {/* Expiry items table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionHeading>Expiring Batches ({expiryItems.length})</SectionHeading>
              {expiryItems.length > 0 && (
                <Button
                  variant="outline" size="sm"
                  leftIcon={<FileDown className="w-3.5 h-3.5" />}
                  onClick={() => exportExpiryCsv(expiryItems, branchNameMap)}
                >
                  Export CSV
                </Button>
              )}
            </div>
            <TableContainer>
              <thead>
                <tr>
                  <Th>Product</Th>
                  {permissions?.isOrgLevel && <Th>Branch</Th>}
                  <Th>Batch #</Th>
                  <Th>Expiry Date</Th>
                  <Th right>Days</Th>
                  <Th right>Qty</Th>
                </tr>
              </thead>
              <tbody>
                {expiryLoading ? (
                  <LoadingRows cols={permissions?.isOrgLevel ? 6 : 5} />
                ) : expiryItems.length === 0 ? (
                  <tr>
                    <td colSpan={permissions?.isOrgLevel ? 6 : 5} className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                      No expiring batches found within {daysThreshold} days.
                    </td>
                  </tr>
                ) : (
                  expiryItems.map((item, idx) => {
                    const days = daysUntilExpiry(item.expiry_date);
                    return (
                      <tr key={idx} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                        <Td>{item.product_name}</Td>
                        {permissions?.isOrgLevel && (
                          <Td muted>{branchNameMap[item.branch_id] ?? item.branch_id}</Td>
                        )}
                        <Td muted>{item.batch_number}</Td>
                        <Td muted>{item.expiry_date}</Td>
                        <Td right>
                          <ExpiryBadge days={days} />
                        </Td>
                        <Td right muted>{item.quantity.toLocaleString()}</Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </TableContainer>
          </div>
        </div>
      )}

    </div>
  );
}
