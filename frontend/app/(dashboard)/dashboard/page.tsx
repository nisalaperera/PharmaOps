"use client";

import {
  Building2, TrendingUp, AlertTriangle, Clock,
  ShoppingCart, Package,
} from "lucide-react";
import { StatCard, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PAYMENT_METHOD_VARIANT } from "@/lib/badges";

// ─── Mock data (replace with real API calls via react-query) ──────────────────

const mockStats = {
  totalBranches:    4,
  totalSalesToday:  142500,
  totalSalesMonth:  3850000,
  totalLowStock:    12,
  totalExpiring:    8,
  totalPendingPOs:  5,
};

const mockBranchSummaries = [
  { branchId: "1", branchName: "Colombo Branch",    todaySales: 52000, lowStockCount: 3, expiringCount: 2, pendingPOs: 1 },
  { branchId: "2", branchName: "Kandy Branch",      todaySales: 38500, lowStockCount: 5, expiringCount: 3, pendingPOs: 2 },
  { branchId: "3", branchName: "Galle Branch",      todaySales: 29000, lowStockCount: 2, expiringCount: 1, pendingPOs: 1 },
  { branchId: "4", branchName: "Negombo Branch",    todaySales: 23000, lowStockCount: 2, expiringCount: 2, pendingPOs: 1 },
];

const mockRecentSales = [
  { id: "INV-001", patient: "Kamal Perera",   amount: 3450, method: "CASH",  time: "10:32 AM" },
  { id: "INV-002", patient: "Nimal Silva",    amount: 1200, method: "CARD",  time: "10:15 AM" },
  { id: "INV-003", patient: "Dilani Fernando",amount: 5800, method: "CREDIT",time: "09:58 AM" },
  { id: "INV-004", patient: "Walk-in",        amount:  890, method: "CASH",  time: "09:40 AM" },
  { id: "INV-005", patient: "Ruwan Jayawardena",amount:2340,method: "CARD",  time: "09:22 AM" },
];


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, permissions } = useAuth();

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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {permissions?.isOrgLevel && (
          <StatCard
            title="Total Branches"
            value={mockStats.totalBranches}
            icon={<Building2 className="w-5 h-5" />}
            accentColor="#004B79"
          />
        )}
        <StatCard
          title="Today's Sales"
          value={formatCurrency(mockStats.totalSalesToday)}
          icon={<TrendingUp className="w-5 h-5" />}
          trend={{ value: 12.4, label: "vs yesterday" }}
          accentColor="#008080"
        />
        <StatCard
          title="Monthly Sales"
          value={formatCurrency(mockStats.totalSalesMonth)}
          icon={<ShoppingCart className="w-5 h-5" />}
          trend={{ value: 8.2, label: "vs last month" }}
          accentColor="#008080"
        />
        <StatCard
          title="Low Stock Items"
          value={mockStats.totalLowStock}
          icon={<Package className="w-5 h-5" />}
          accentColor="#ED1B2E"
        />
        <StatCard
          title="Expiring Soon"
          value={mockStats.totalExpiring}
          icon={<Clock className="w-5 h-5" />}
          accentColor="#f59e0b"
        />
        <StatCard
          title="Pending POs"
          value={mockStats.totalPendingPOs}
          icon={<AlertTriangle className="w-5 h-5" />}
          accentColor="#004B79"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Recent sales */}
        <Card className="xl:col-span-2" padding="none">
          <div className="flex items-center justify-between px-5 py-4 border-b"
               style={{ borderColor: "var(--color-border)" }}>
            <h2 className="font-semibold" style={{ color: "var(--color-text)" }}>
              Recent Sales
            </h2>
            <a href="/billing" className="text-sm font-medium text-primary-500 hover:text-primary-600">
              View all
            </a>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {mockRecentSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                    {sale.patient}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {sale.id} · {sale.time}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <Badge variant={PAYMENT_METHOD_VARIANT[sale.method as keyof typeof PAYMENT_METHOD_VARIANT] ?? "default"}>
                    {sale.method}
                  </Badge>
                  <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                    {formatCurrency(sale.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {mockBranchSummaries.map((branch) => (
                <div key={branch.branchId} className="px-5 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      {branch.branchName}
                    </p>
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                      {formatCurrency(branch.todaySales)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {branch.lowStockCount > 0 && (
                      <Badge variant="danger" dot>
                        {branch.lowStockCount} low stock
                      </Badge>
                    )}
                    {branch.expiringCount > 0 && (
                      <Badge variant="warning" dot>
                        {branch.expiringCount} expiring
                      </Badge>
                    )}
                    {branch.pendingPOs > 0 && (
                      <Badge variant="info" dot>
                        {branch.pendingPOs} PO
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
              <AlertItem color="#ED1B2E" label="Low stock items" count={3} href="/inventory" />
              <AlertItem color="#f59e0b" label="Expiring in 30 days" count={2} href="/inventory" />
              <AlertItem color="#004B79" label="Pending approvals" count={1} href="/purchase-orders" />
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
