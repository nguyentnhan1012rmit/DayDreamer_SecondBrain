"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

type TokenStats = { today: number; week: number; month: number; queriesToday: number };

function readTokenStats(): TokenStats {
  try {
    const stored = JSON.parse(localStorage.getItem("dd-token-usage") || "{}") as Record<string, { tokens?: number; queries?: number }>;
    const now = new Date();
    let week = 0;
    let month = 0;
    for (let index = 0; index < 30; index++) {
      const date = new Date(now);
      date.setDate(date.getDate() - index);
      const tokens = stored[date.toISOString().slice(0, 10)]?.tokens ?? 0;
      month += tokens;
      if (index < 7) week += tokens;
    }
    const today = stored[now.toISOString().slice(0, 10)] ?? {};
    return { today: today.tokens ?? 0, week, month, queriesToday: today.queries ?? 0 };
  } catch {
    return { today: 0, week: 0, month: 0, queriesToday: 0 };
  }
}

export function PreferencesSettingsTab() {
  const { theme, setTheme } = useTheme();
  const [language, setLanguage] = useState<"en" | "vi">("en");
  const [stats, setStats] = useState<TokenStats>({ today: 0, week: 0, month: 0, queriesToday: 0 });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setStats(readTokenStats());
      const saved = localStorage.getItem("dd-response-lang");
      if (saved === "en" || saved === "vi") setLanguage(saved);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="space-y-6">
      <section className="enterprise-card p-5">
        <Heading eyebrow="Appearance" title="Theme & Language" />
        <div className="mt-5 space-y-4">
          <SettingPanel label="Color theme">
            <div className="grid grid-cols-3 gap-3">
              {([{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Laptop }] as const).map((option) => {
                const Icon = option.icon;
                return <button key={option.value} type="button" onClick={() => setTheme(option.value)} className={`flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border text-sm font-medium ${theme === option.value ? "border-slate-900 bg-slate-100 text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"}`}><Icon className="h-5 w-5" />{option.label}</button>;
              })}
            </div>
          </SettingPanel>
          <SettingPanel label="AI response language">
            <div className="grid grid-cols-2 gap-3">
              {([{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }] as const).map((option) => <button key={option.value} type="button" onClick={() => { setLanguage(option.value); localStorage.setItem("dd-response-lang", option.value); }} className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${language === option.value ? "border-slate-900 bg-slate-100 text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400"}`}>{option.label}</button>)}
            </div>
          </SettingPanel>
        </div>
      </section>

      <section className="enterprise-card p-5">
        <Heading eyebrow="Usage" title="AI Token Usage" />
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Stat label="Today" value={stats.today} suffix="tokens" />
          <Stat label="This week" value={stats.week} suffix="tokens" />
          <Stat label="This month" value={stats.month} suffix="tokens" />
          <Stat label="Queries today" value={stats.queriesToday} suffix="searches" />
        </div>
        <button type="button" onClick={() => { localStorage.removeItem("dd-token-usage"); setStats({ today: 0, week: 0, month: 0, queriesToday: 0 }); }} className="action-secondary mt-4">Clear usage history</button>
      </section>
    </div>
  );
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p><h3 className="mt-1.5 text-xl font-semibold text-slate-950 dark:text-slate-100">{title}</h3></div>;
}

function SettingPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="enterprise-panel bg-white p-4 dark:bg-slate-950"><p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>{children}</div>;
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <div className="enterprise-panel bg-white p-4 text-center dark:bg-slate-950"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value.toLocaleString()}</p><p className="text-xs text-slate-400">{suffix}</p></div>;
}
