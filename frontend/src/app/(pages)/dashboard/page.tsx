"use client";

import {
  Building2, TrendingUp, AlertTriangle, Clock,
  ShoppingCart, Package,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatCard, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api-client";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { PAYMENT_METHOD_VARIANT } from "@/lib/badges";
import type { DashboardStats } from "@/types";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, permissions } = useAuth();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey:        ["dashboard-stats"],
    queryFn:         () => apiGet<DashboardStats>("/dashboard/stats"),
    enabled:         !!user,
    refetchInterval: 60_000,
  });

  return (
    <div className="page-container">
      {/* Greeting */}
      <div>
        <h1 className="page-title">
          Good morning, {user?.fullName.split(" ")[0]} 👋
        </h1>
        <p className="page-subtitle mt-1">
          {formatDate(new Date().toISOString(), "long")}
        </p>
      </div>

      {/* Stat cards */}
      {isLoading || !stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: permissions?.isOrgLevel ? 6 : 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[104px] rounded-2xl animate-pulse"
              style={{ background: "var(--color-surface-2)" }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {permissions?.isOrgLevel && (
            <StatCard
              title="Total Branches"
              value={stats.total_branches}
              icon={<Building2 className="w-5 h-5" />}
              accentColor="#004B79"
            />
          )}
          <StatCard
            title="Today's Sales"
            value={formatCurrency(stats.today_sales)}
            icon={<TrendingUp className="w-5 h-5" />}
            accentColor="#008080"
          />
          <StatCard
            title="Monthly Sales"
            value={formatCurrency(stats.month_sales)}
            icon={<ShoppingCart className="w-5 h-5" />}
            accentColor="#008080"
          />
          <StatCard
            title="Low Stock Items"
            value={stats.low_stock_count}
            icon={<Package className="w-5 h-5" />}
            accentColor="#ED1B2E"
          />
          <StatCard
            title="Expiring Soon"
            value={stats.expiring_count}
            icon={<Clock className="w-5 h-5" />}
            accentColor="#f59e0b"
          />
          <StatCard
            title="Pending POs"
            value={stats.pending_po_count}
            icon={<AlertTriangle className="w-5 h-5" />}
            accentColor="#004B79"
          />
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Recent sales */}
        <Card className="xl:col-span-2" padding="none">
          <div className="flex items-center justify-between px-5 py-4 border-b"
               style={{ borderColor: "var(--color-border)" }}>
            <h2 className="font-semibold" style={{ color: "var(--color-text)" }}>
              Recent Sales
            </h2>
            <a href="/sales/invoices" className="text-sm font-medium text-primary-500 hover:text-primary-600">
              View all
            </a>
          </div>
          {isLoading || !stats ? (
            <div className="px-5 py-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg animate-pulse"
                  style={{ background: "var(--color-surface-2)" }}
                />
              ))}
            </div>
          ) : stats.recent_sales.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
              No sales recorded yet.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {stats.recent_sales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {sale.customer_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {sale.created_at ? formatDateTime(sale.created_at) : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <Badge variant={PAYMENT_METHOD_VARIANT[sale.payment_method as keyof typeof PAYMENT_METHOD_VARIANT] ?? "default"}>
                      {sale.payment_method}
                    </Badge>
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                      {formatCurrency(sale.total_amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Branch summary (org-level only) */}
        {permissions?.isOrgLevel ? (
          <Card padding="none">
            <div className="flex items-center justify-between px-5 py-4 border-b"
                 style={{ borderColor: "var(--color-border)" }}>
              <h2 className="font-semibold" style={{ color: "var(--color-text)" }}>
                Branch Overview
              </h2>
            </div>
            {isLoading || !stats ? (
              <div className="px-5 py-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg animate-pulse"
                    style={{ background: "var(--color-surface-2)" }}
                  />
                ))}
              </div>
            ) : stats.branch_summaries.length === 0 ? (
              <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
                No active branches found.
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {stats.branch_summaries.map((branch) => (
                  <div key={branch.branch_id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {branch.branch_name}
                      </p>
                      <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        {formatCurrency(branch.today_sales)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {branch.low_stock_count > 0 && (
                        <Badge variant="danger" dot>
                          {branch.low_stock_count} low stock
                        </Badge>
                      )}
                      {branch.expiring_count > 0 && (
                        <Badge variant="warning" dot>
                          {branch.expiring_count} expiring
                        </Badge>
                      )}
                      {branch.pending_po_count > 0 && (
                        <Badge variant="info" dot>
                          {branch.pending_po_count} PO
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          /* Branch-level: show quick alerts */
          <Card padding="none">
            <div className="px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="font-semibold" style={{ color: "var(--color-text)" }}>
                Alerts
              </h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              <AlertItem color="#ED1B2E" label="Low stock items"     count={stats?.low_stock_count  ?? 0} href="/inventory" />
              <AlertItem color="#f59e0b" label="Expiring in 30 days" count={stats?.expiring_count   ?? 0} href="/inventory" />
              <AlertItem color="#004B79" label="Pending approvals"   count={stats?.pending_po_count ?? 0} href="/purchase-orders" />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Alert item ───────────────────────────────────────────────────────────────

function AlertItem({
  color, label, count, href,
}: {
  color: string; label: string; count: number; href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-[var(--color-surface-2)]"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-sm" style={{ color: "var(--color-text)" }}>{label}</span>
      </div>
      <span
        className="text-sm font-bold px-2 py-0.5 rounded-full"
        style={{ background: `${color}1a`, color }}
      >
        {count}
      </span>
    </a>
  );
}
