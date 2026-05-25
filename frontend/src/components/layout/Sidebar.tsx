"use client";

import { useState, useCallback, memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, X } from "lucide-react";
import Image from "next/image";
import { navigationConfig, type NavItem } from "@/lib/nav-config";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission, cn } from "@/lib/utils";
import APP_CONFIG from "@/lib/config";
import type { UserRole } from "@/types";

type NavUser = { role: UserRole } | null;

// Pre-compute all nav hrefs once at module level — never recalculated
function collectAllHrefs(items: NavItem[]): string[] {
  const hrefs: string[] = [];
  for (const item of items) {
    if (item.href) hrefs.push(item.href);
    if (item.children) hrefs.push(...collectAllHrefs(item.children));
  }
  return hrefs;
}
const ALL_NAV_HREFS = collectAllHrefs(navigationConfig);

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href) {
    if (item.href === "/dashboard") return pathname === item.href;
    const hasMoreSpecificMatch = ALL_NAV_HREFS.some(
      (href) => href !== item.href && href.startsWith(item.href + "/") && pathname.startsWith(href)
    );
    return pathname === item.href || (!hasMoreSpecificMatch && pathname.startsWith(item.href));
  }
  return item.children?.some((child) => isNavItemActive(child, pathname)) ?? false;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  isCollapsed:      boolean;
  isMobileOpen:     boolean;
  onToggleCollapse: () => void;
  onCloseMobile:    () => void;
}

// ─── NavItemComponent ─────────────────────────────────────────────────────────
// user and pathname are passed as props — no hooks inside this component.

const NavItemComponent = memo(function NavItemComponent({
  item,
  user,
  pathname,
  depth = 0,
  isCollapsed,
  openGroups,
  onToggleGroup,
}: {
  item:          NavItem;
  user:          NavUser;
  pathname:      string;
  depth?:        number;
  isCollapsed:   boolean;
  openGroups:    Set<string>;
  onToggleGroup: (id: string) => void;
}) {
  if (!user) return null;
  if (!hasPermission(user.role, item.requiredRole)) return null;

  const hasChildren  = !!item.children?.length;
  const isGroupOpen  = openGroups.has(item.id);

  const isActive = isNavItemActive(item, pathname);

  const Icon = item.icon;

  const linkContent = (
    <>
      <span className={cn("flex-shrink-0 transition-transform duration-150", isActive && "text-primary-500")}>
        <Icon className="w-[18px] h-[18px]" />
      </span>

      {!isCollapsed && (
        <>
          <span className="flex-1 truncate text-[13.5px]">{item.label}</span>
          {hasChildren && (
            <span
              className="flex-shrink-0 transition-transform duration-200"
              style={{ transform: isGroupOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <ChevronDown className="w-4 h-4" />
            </span>
          )}
          {!hasChildren && isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
          )}
        </>
      )}
    </>
  );

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => onToggleGroup(item.id)}
          title={isCollapsed ? item.label : undefined}
          className={cn(
            "nav-link w-full",
            isActive && "active",
            depth > 0 && "pl-5",
            isCollapsed && "justify-center px-2"
          )}
        >
          {linkContent}
        </button>

        {!isCollapsed && (
          <div
            className="overflow-hidden transition-all duration-200"
            style={{ maxHeight: isGroupOpen ? "1000px" : "0px" }}
          >
            <div
              className="ml-4 border-l pl-2 mt-1 mb-1 space-y-0.5"
              style={{ borderColor: "var(--color-border)" }}
            >
              {item.children!.map((child) => (
                <NavItemComponent
                  key={child.id}
                  item={child}
                  user={user}
                  pathname={pathname}
                  depth={depth + 1}
                  isCollapsed={isCollapsed}
                  openGroups={openGroups}
                  onToggleGroup={onToggleGroup}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href!}
      title={isCollapsed ? item.label : undefined}
      className={cn(
        "nav-link",
        isActive && "active",
        depth > 0 && "pl-4 py-2",
        isCollapsed && "justify-center px-2"
      )}
    >
      {linkContent}
    </Link>
  );
});

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({
  isCollapsed,
  isMobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const { user }  = useAuth();

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(["products", "purchase-orders", "staff", "ledger", "bank-group"])
  );

  const handleToggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const sidebarContent = (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div
        className={cn(
          "flex items-center h-16 px-4 border-b flex-shrink-0",
          isCollapsed ? "justify-center" : "justify-between"
        )}
        style={{ borderColor: "var(--color-border)" }}
      >
        {!isCollapsed && (
          <Image
            src={APP_CONFIG.appLogo}
            alt={APP_CONFIG.appName}
            width={144}
            height={32}
            className="rounded-lg flex-shrink-0"
          />
        )}

        <button
          onClick={isMobileOpen ? onCloseMobile : onToggleCollapse}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-2)]"
          style={{ color: "var(--color-text-muted)" }}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isMobileOpen ? (
            <X className="w-5 h-5" />
          ) : isCollapsed ? (
            <Image
              src={APP_CONFIG.appIcon}
              alt={APP_CONFIG.appName}
              width={48}
              height={48}
              className="rounded-lg"
            />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navigationConfig.map((item) => (
          <NavItemComponent
            key={item.id}
            item={item}
            user={user}
            pathname={pathname}
            isCollapsed={isCollapsed}
            openGroups={openGroups}
            onToggleGroup={handleToggleGroup}
          />
        ))}
      </nav>

    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col fixed top-0 left-0 h-full z-30 transition-all duration-300"
        style={{
          width:       isCollapsed ? "68px" : "260px",
          background:  "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={onCloseMobile}
          style={{ background: "rgba(0,0,0,0.5)" }}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex flex-col lg:hidden transition-transform duration-300",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          width:       "260px",
          background:  "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
