"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/contexts/AuthContext";
import { AdminSettingsTab } from "@/features/settings/components/admin-settings-tab";
import { GoogleSettingsTab } from "@/features/settings/components/google-settings-tab";
import { MemorySettingsTab } from "@/features/settings/components/memory-settings-tab";
import { PreferencesSettingsTab } from "@/features/settings/components/preferences-settings-tab";
import { ProfileSettingsTab } from "@/features/settings/components/profile-settings-tab";

type SettingsTab = "profile" | "google" | "memory" | "preferences" | "admin";

const baseTabs: Array<{ id: SettingsTab; label: string; description: string }> = [
  { id: "profile", label: "Profile", description: "Account and password" },
  { id: "google", label: "Google Workspace", description: "Calendar, Gmail, Drive, Contacts" },
  { id: "preferences", label: "Preferences", description: "Theme, language, usage" },
];

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const tabs = useMemo(() => isAdmin ? [baseTabs[0], baseTabs[1], { id: "memory" as const, label: "Memory & Indexing", description: "Readiness and recent jobs" }, baseTabs[2], { id: "admin" as const, label: "Admin", description: "Queue, health, diagnostics" }] : baseTabs, [isAdmin]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const hash = window.location.hash;
      if (hash === "#google-workspace") setActiveTab("google");
      if (isAdmin && hash === "#memory-status") setActiveTab("memory");
      if (isAdmin && hash === "#admin-status") setActiveTab("admin");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && (activeTab === "memory" || activeTab === "admin")) {
      const timeoutId = window.setTimeout(() => setActiveTab("profile"), 0);
      return () => window.clearTimeout(timeoutId);
    }
    return undefined;
  }, [activeTab, isAdmin]);

  function selectTab(tab: SettingsTab) {
    setActiveTab(tab);
    const hash = tab === "google" ? "#google-workspace" : tab === "memory" ? "#memory-status" : tab === "admin" ? "#admin-status" : "";
    window.history.replaceState(null, "", hash || window.location.pathname);
  }

  return (
    <DashboardShell title="Settings" description="Manage your profile, preferences, integrations and system status.">
      <div className="mx-auto max-w-5xl space-y-6">
        <nav className="enterprise-card p-1.5" aria-label="Settings sections">
          <div className={`grid gap-2 ${isAdmin ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return <button key={tab.id} type="button" onClick={() => selectTab(tab.id)} aria-current={active ? "page" : undefined} className={`cursor-pointer rounded-lg px-3.5 py-3 text-left transition ${active ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900/60" : "text-slate-600 hover:bg-blue-50/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"}`}><span className="block text-sm font-bold">{tab.label}</span><span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">{tab.description}</span></button>;
            })}
          </div>
        </nav>

        {activeTab === "profile" ? <ProfileSettingsTab /> : null}
        {activeTab === "google" ? <GoogleSettingsTab /> : null}
        {isAdmin && activeTab === "memory" ? <MemorySettingsTab /> : null}
        {activeTab === "preferences" ? <PreferencesSettingsTab /> : null}
        {isAdmin && activeTab === "admin" ? <AdminSettingsTab /> : null}
      </div>
    </DashboardShell>
  );
}
