"use client";

import { RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsMessage, StatusTile, type StatusTone } from "../settings-ui";
import { useSettingsSystemStatus } from "../use-settings-system-status";

export function MemorySettingsTab() {
  const { isAuthenticated } = useAuth();
  const { indexing, readiness, isLoading, message, refresh } = useSettingsSystemStatus();
  const counts = indexing?.counts ?? {};
  const failed = (counts.failed ?? 0) + (counts.dead_letter ?? 0);
  const active = (counts.pending ?? 0) + (counts.retry ?? 0) + (counts.processing ?? 0);
  const tone: StatusTone = failed ? "attention" : active ? "working" : indexing?.available ? "ready" : "idle";

  return (
    <section className="enterprise-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">Memory</p><h3 className="mt-1.5 text-xl font-semibold text-slate-950 dark:text-slate-100">Memory & Indexing Status</h3><p className="mt-1 text-sm text-slate-500">Readiness for diary, attachments, Google imports and AI search.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={isLoading} className="action-secondary"><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh</button>
      </div>
      {!isAuthenticated ? <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">Sign in to inspect memory status.</p> : <>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatusTile label="Overall" value={readiness?.ready ? "Memory is ready" : active ? "Indexing in progress" : failed ? "Needs attention" : "Checking"} detail={readiness?.nextActions[0] ?? "Add memories and allow the worker to index them."} tone={readiness?.ready ? "ready" : tone} />
          <StatusTile label="Memory chunks" value={`${readiness?.counts.memoryChunks ?? 0}`} detail={`${readiness?.counts.diaryEntries ?? 0} diary entries · ${readiness?.counts.extractedAttachments ?? 0} extracted attachments`} tone={(readiness?.counts.memoryChunks ?? 0) > 0 ? "ready" : "idle"} />
          <StatusTile label="Queue" value={failed ? `${failed} failed` : active ? `${active} active` : "Clear"} detail={`${counts.succeeded ?? 0} jobs completed`} tone={tone} />
        </div>
        <SettingsMessage message={message} />
        <RecentJobs />
      </>}
    </section>
  );

  function RecentJobs() {
    if (!indexing?.recent.length) return <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No indexing jobs found for your account.</p>;
    return <div className="mt-5 space-y-2">{indexing.recent.slice(0, 8).map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"><div><p className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{job.sourceType} · {job.jobType.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">Updated {new Date(job.updatedAt).toLocaleString()}</p></div><span className="status-badge capitalize">{job.status.replaceAll("_", " ")}</span></div>)}</div>;
  }
}
