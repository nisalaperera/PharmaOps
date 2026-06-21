"use client";

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { formatAmount } from "@/lib/utils";
import type { PaymentBreakdown } from "@/types";

interface Props {
  data: PaymentBreakdown[];
}

const COLORS = ["#008080", "#004B79", "#f59e0b", "#ED1B2E", "#6366f1"];

const METHOD_LABELS: Record<string, string> = {
  CASH:          "Cash",
  CARD:          "Card",
  BANK_TRANSFER: "Bank Transfer",
  CREDIT:        "Credit",
  CHEQUE:        "Cheque",
};

export function PaymentBreakdownChart({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: METHOD_LABELS[d.method] ?? d.method,
  }));

  return (
    <Card padding="none">
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <h2 className="font-semibold" style={{ color: "var(--color-text)" }}>
          Payment Methods
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Last 30 days
        </p>
      </div>
      <div className="px-4 py-4" style={{ height: 300 }}>
        {data.length === 0 ? (
          <p className="text-sm text-center pt-20" style={{ color: "var(--color-text-muted)" }}>
            No payment data available.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="amount"
                nameKey="label"
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={3}
                strokeWidth={0}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                formatter={(value: number) => [`LKR ${formatAmount(value)}`, "Revenue"]}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
