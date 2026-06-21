"use client";

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { formatAmount } from "@/lib/utils";
import type { RevenueTrendPoint } from "@/types";

interface Props {
  data: RevenueTrendPoint[];
}

function formatDateLabel(dateStr: string): string {
  const [, mm, dd] = dateStr.split("-");
  return `${mm}/${dd}`;
}

export function RevenueTrendChart({ data }: Props) {
  return (
    <Card padding="none" className="xl:col-span-2">
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <h2 className="font-semibold" style={{ color: "var(--color-text)" }}>
          Revenue Trend
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Last 30 days
        </p>
      </div>
      <div className="px-4 py-4" style={{ height: 300 }}>
        {data.length === 0 ? (
          <p className="text-sm text-center pt-20" style={{ color: "var(--color-text-muted)" }}>
            No sales data available.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#008080" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#008080" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
              />
              <YAxis
                tickFormatter={(v: number) => formatAmount(v)}
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                labelFormatter={formatDateLabel}
                formatter={(value: number, name: string) => [
                  `LKR ${formatAmount(value)}`,
                  name === "amount" ? "Revenue" : "Sales",
                ]}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#008080"
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
