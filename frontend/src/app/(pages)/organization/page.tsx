"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building, Settings, Users, Calculator } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { GeneralTab } from "./components/GeneralTab";
import { ContactsTab } from "./components/ContactsTab";
import { SettingsTab } from "./components/SettingsTab";
import { HRParamsTab } from "./components/HRParamsTab";
import type { Chain } from "@/types";

type TabId = "general" | "contacts" | "settings" | "hr";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "general",  label: "General",   icon: <Building    className="w-4 h-4" /> },
  { id: "contacts", label: "Contacts",  icon: <Users       className="w-4 h-4" /> },
  { id: "settings", label: "Settings",  icon: <Settings    className="w-4 h-4" /> },
  { id: "hr",       label: "HR Params", icon: <Calculator  className="w-4 h-4" /> },
];

export default function OrganizationPage() {
  const { user: session } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const { data: chain, isLoading } = useQuery<Chain>({
    queryKey: ["chain"],
    queryFn:  () => apiGet<Chain>("/chain"),
    enabled:  !!session,
  });

  return (
    <div className="page-container max-w-4xl">
      <div>
        <h1 className="page-title">Organization</h1>
        <p className="page-subtitle mt-1">Manage your chain-level settings and contacts</p>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2",
              activeTab === tab.id
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent hover:border-[var(--color-border)]"
            )}
            style={{
              color: activeTab === tab.id ? undefined : "var(--color-text-muted)",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className="rounded-2xl shadow-card p-6"
        style={{ background: "var(--color-surface)" }}
      >
        {isLoading || !chain ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === "general"  && <GeneralTab  chain={chain} />}
            {activeTab === "contacts" && <ContactsTab chain={chain} />}
            {activeTab === "settings" && <SettingsTab chain={chain} />}
            {activeTab === "hr"       && <HRParamsTab chain={chain} />}
          </>
        )}
      </div>
    </div>
  );
}
