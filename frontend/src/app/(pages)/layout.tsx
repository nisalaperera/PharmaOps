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
  const [isDesktop,        setIsDesktop]         = useState(true);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) setMobileOpen(false);
    };
    handleResize();
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
        style={{ marginLeft: isDesktop ? (sidebarCollapsed ? "68px" : "260px") : 0 }}
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
