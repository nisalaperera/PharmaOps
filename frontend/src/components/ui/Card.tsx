import { cn } from "@/lib/utils";

interface CardProps {
  children:   React.ReactNode;
  className?: string;
  padding?:   "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm:   "p-4",
  md:   "p-5",
  lg:   "p-6",
};

export function Card({ children, className, padding = "md" }: CardProps) {
  return (
    <div className={cn("surface shadow-card", paddingClasses[padding], className)}>
      {children}
    </div>
  );
}

interface StatCardProps {
  title:       string;
  value:       string | number;
  icon:        React.ReactNode;
  trend?:      { value: number; label: string };
  accentColor?: string;
  className?:  string;
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  accentColor = "#008080",
  className,
}: StatCardProps) {
  const trendPositive = trend && trend.value >= 0;

  return (
    <div className={cn("surface shadow-card p-5 flex items-start justify-between", className)}>
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
          {title}
        </p>
        <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text)" }}>
          {value}
        </p>
        {trend && (
          <p
            className="text-xs mt-1 font-medium"
            style={{ color: trendPositive ? "#10b981" : "#ef4444" }}
          >
            {trendPositive ? "+" : ""}{trend.value}% {trend.label}
          </p>
        )}
      </div>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${accentColor}1a`, color: accentColor }}
      >
        {icon}
      </div>
    </div>
  );
}
