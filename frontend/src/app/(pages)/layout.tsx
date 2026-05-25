"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header }  from "@/components/layout/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen,       setMobileOpen]       = useState(false);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Sidebar
        isCollapsed={sidebarCollapsed}
        isMobileOpen={mobileOpen}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div
        className="flex flex-col min-h-screen transition-all duration-300"
        style={{ marginLeft: sidebarCollapsed ? "68px" : "260px" }}
      >
        <Header
          onOpenMobileSidebar={() => setMobileOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main
          className="flex-1 mt-16 overflow-y-auto"
          style={{ background: "var(--color-bg)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
