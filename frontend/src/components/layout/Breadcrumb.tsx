"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationConfig } from "@/lib/nav-config";

// ─── Breadcrumb builder ───────────────────────────────────────────────────────

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

function buildBreadcrumb(pathname: string): BreadcrumbSegment[] {
  for (const item of navigationConfig) {
    if (item.href && (pathname === item.href || pathname.startsWith(item.href + "/"))) {
      return [{ label: item.label, href: item.href }];
    }

    if (item.children) {
      for (const child of item.children) {
        if (child.href && (pathname === child.href || pathname.startsWith(child.href + "/"))) {
          return [
            { label: item.label },
            { label: child.label, href: child.href },
          ];
        }
      }
    }
  }

  return [];
}

// ─── BreadcrumbBar ────────────────────────────────────────────────────────────

interface BreadcrumbBarProps {
  sidebarCollapsed: boolean;
}

export function BreadcrumbBar({ sidebarCollapsed }: BreadcrumbBarProps) {
  const pathname   = usePathname();
  const segments   = buildBreadcrumb(pathname);

  if (segments.length === 0) return null;

  return (
    <div
      className="fixed top-16 right-0 z-20 flex items-center h-9 px-4 border-b transition-all duration-300"
      style={{
        left:        sidebarCollapsed ? "68px" : "260px",
        background:  "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "var(--color-text-muted)" }}
              />
            )}
            {index === segments.length - 1 ? (
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {segment.label}
              </span>
            ) : segment.href ? (
              <Link
                href={segment.href}
                className="text-xs transition-colors hover:text-primary-500"
                style={{ color: "var(--color-text-muted)" }}
              >
                {segment.label}
              </Link>
            ) : (
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                {segment.label}
              </span>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
