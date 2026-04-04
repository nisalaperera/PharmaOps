"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, Bell, ChevronDown, User, Settings, KeyRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "./ThemeToggle";
import { getInitials, getRoleLabel, cn } from "@/lib/utils";
import { getRoleBadgeColor } from "@/lib/badges";
import { apiGet } from "@/lib/api-client";
import APP_CONFIG from "@/lib/config";
import { ChangePasswordModal } from "@/app/(pages)/profile/components/ChangePasswordModal";
import type { Branch } from "@/types";

interface HeaderProps {
  onOpenMobileSidebar: () => void;
  sidebarCollapsed:    boolean;
}

export function Header({ onOpenMobileSidebar, sidebarCollapsed }: HeaderProps) {
  const { user }    = useAuth();
  const [dropdownOpen,       setDropdownOpen]       = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch branch name when user is assigned to a branch
  const { data: branch } = useQuery<Branch>({
    queryKey: ["branch", user?.branchId],
    queryFn:  () => apiGet<Branch>(`/branches/${user!.branchId}`),
    enabled:  !!user?.branchId,
    staleTime: Infinity,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
    <header
      className="fixed top-0 right-0 z-30 flex items-center justify-between h-16 px-4 border-b transition-all duration-300"
      style={{
        left:        `${sidebarCollapsed ? 68 : 260}px`,
        background:  "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Left: mobile menu + org identity */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 rounded-lg transition-colors hover:bg-[var(--color-surface-2)]"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2.5">
          <Image
            src={APP_CONFIG.orgLogo}
            alt={APP_CONFIG.orgName}
            width={36}
            height={36}
            className="rounded-lg object-contain flex-shrink-0"
          />
          <div>
            <p className="text-xl font-semibold leading-tight" style={{ color: "var(--color-text)" }}>
              {APP_CONFIG.orgName}
            </p>
            {branch && (
              <p className="text-[11px] leading-tight" style={{ color: "var(--color-text-muted)" }}>
                {branch.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right: theme toggle + notifications + user */}
      <div className="flex items-center gap-3">
        <ThemeToggle />

        {/* Notification bell */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-lg transition-colors hover:bg-[var(--color-surface-2)]"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="View notifications"
        >
          <Bell className="w-5 h-5" />
          {/* Unread badge — swap with real count */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger-500" />
        </Link>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #008080, #004B79)" }}
            >
              {user ? getInitials(user.fullName) : "?"}
            </div>
            {user && (
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold leading-tight" style={{ color: "var(--color-text)" }}>
                  {user.fullName}
                </p>
                <p className="text-[10px] leading-tight" style={{ color: "var(--color-text-muted)" }}>
                  {getRoleLabel(user.role)}
                </p>
              </div>
            )}
            <ChevronDown
              className={cn(
                "w-4 h-4 transition-transform duration-200",
                dropdownOpen && "rotate-180"
              )}
              style={{ color: "var(--color-text-muted)" }}
            />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl shadow-card-lg border overflow-hidden animate-fade-in z-50"
              style={{
                background:  "var(--color-surface)",
                borderColor: "var(--color-border)",
              }}
            >
              {/* User info */}
              {user && (
                <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                    {user.fullName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {user.email}
                  </p>
                  <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1.5", getRoleBadgeColor(user.role))}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>
              )}

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: "var(--color-text)" }}
                >
                  <User className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
                  My Profile
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: "var(--color-text)" }}
                >
                  <Settings className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
                  Settings
                </Link>
                <button
                  onClick={() => { setDropdownOpen(false); setChangePasswordOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: "var(--color-text)" }}
                >
                  <KeyRound className="w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
                  Change Password
                </button>
              </div>

              <div className="border-t py-1" style={{ borderColor: "var(--color-border)" }}>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-danger-600 dark:text-danger-400 transition-colors hover:bg-danger-50 dark:hover:bg-danger-900/20"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {user && (
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        userId={user.id}
      />
    )}
    </>
  );
}
