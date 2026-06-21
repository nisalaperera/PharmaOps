"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { formatAmount } from "@/lib/utils";
import type { TopProduct } from "@/types";

interface Props {
  data: TopProduct[];
}

export function TopProductsChart({ data }: Props) {
  const chartData = data.map((p) => ({
    ...p,
    name: p.product_name.length > 18
      ? p.product_name.slice(0, 16) + "…"
      : p.product_name,
  }));

  return (
    <Card padding="none" className="xl:col-span-2">
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <h2 className="font-semibold" style={{ color: "var(--color-text)" }}>
          Top Products
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          By revenue — last 30 days
        </p>
      </div>
      <div className="px-4 py-4" style={{ height: 300 }}>
        {data.length === 0 ? (
          <p className="text-sm text-center pt-20" style={{ color: "var(--color-text-muted)" }}>
            No product data available.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatAmount(v)}
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={130}
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                formatter={(value: number, name: string) => [
                  name === "total_amount" ? `LKR ${formatAmount(value)}` : value,
                  name === "total_amount" ? "Revenue" : "Qty Sold",
                ]}
                labelFormatter={(label: string) => label}
              />
              <Bar dataKey="total_amount" fill="#004B79" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
