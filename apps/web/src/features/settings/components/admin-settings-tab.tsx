"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { SettingsMessage, StatusTile, type StatusTone } from "../settings-ui";
import { useSettingsSystemStatus } from "../use-settings-system-status";

export function AdminSettingsTab() {
  const { diagnostics, indexing, readiness, isLoading, isRequeueing, message, refresh, requeueJob, requeueDeadLetters } = useSettingsSystemStatus({ includeAdmin: true });
  const counts = diagnostics?.indexingOutbox.counts ?? indexing?.counts ?? {};
  const failed = (counts.failed ?? 0) + (counts.dead_letter ?? 0);
  const active = (counts.pending ?? 0) + (counts.retry ?? 0) + (counts.processing ?? 0);
  const queueTone: StatusTone = failed ? "attention" : active ? "working" : diagnostics?.indexingOutbox.available ? "ready" : "idle";
  const workerTone: StatusTone = diagnostics?.worker?.ok ? "ready" : diagnostics?.worker ? "attention" : "idle";
  const embedding = indexing?.embeddingIndex ?? diagnostics?.embeddingIndex;
  const embeddingTone: StatusTone = embedding?.healthy ? "ready" : embedding ? "attention" : "idle";

  return (
    <div className="space-y-6">
      <section className="enterprise-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-600">Admin</p><h3 className="mt-1.5 text-xl font-semibold text-slate-950 dark:text-slate-100">System readiness</h3><p className="mt-1 text-sm text-slate-500">Worker, queue, embeddings and deployment configuration.</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => void refresh()} disabled={isLoading} className="action-secondary"><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh</button><button type="button" onClick={() => void requeueDeadLetters()} disabled={isRequeueing} className="action-primary px-4"><RotateCcw className="h-4 w-4" />Requeue failed</button></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusTile label="API" value={diagnostics?.database.ok ? "Database ready" : "Needs attention"} detail={diagnostics?.database.detail ?? "Waiting for diagnostics."} tone={diagnostics?.database.ok ? "ready" : diagnostics ? "attention" : "idle"} />
          <StatusTile label="Worker" value={diagnostics?.worker?.status ?? "Unknown"} detail={diagnostics?.worker?.detail ?? "No worker heartbeat loaded."} tone={workerTone} />
          <StatusTile label="Indexing queue" value={failed ? `${failed} need action` : active ? `${active} active` : "Clear"} detail={`${counts.succeeded ?? 0} jobs succeeded`} tone={queueTone} />
          <StatusTile label="Embedding index" value={embedding?.embeddingModel ?? "Unknown"} detail={embedding ? `${embedding.currentEmbeddingModelChunks} current · ${embedding.missingEmbeddingChunks} missing · ${embedding.staleEmbeddingModelChunks} stale` : "No embedding diagnostics."} tone={embeddingTone} />
        </div>
        <div className="mt-4"><SettingsMessage message={message} /></div>
      </section>

      <section className="enterprise-card p-5">
        <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-100">Environment checks</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Environment label="Database URL" ready={diagnostics?.environment.databaseConfigured} />
          <Environment label="Supabase" ready={diagnostics?.environment.supabaseConfigured} />
          <Environment label="Tuturuuu AI" ready={diagnostics?.environment.tuturuuuConfigured} />
          <Environment label="Google OAuth" ready={diagnostics?.environment.googleOAuthConfigured} />
          <Environment label="Redis" ready={diagnostics?.environment.redisConfigured && diagnostics?.environment.redisReachable} optional />
          <Environment label="Temporal" ready={diagnostics?.environment.temporalConfigured} optional />
          <Environment label="Sentry" ready={diagnostics?.environment.sentryConfigured} optional />
          <Environment label="OpenTelemetry" ready={diagnostics?.environment.openTelemetryConfigured} optional />
        </div>
        {diagnostics?.warnings.length ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">{diagnostics.warnings.join(" ")}</div> : null}
      </section>

      <section className="enterprise-card p-5">
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-950 dark:text-slate-100">Recent indexing jobs</h3><span className="status-badge">{indexing?.recent.length ?? 0} shown</span></div>
        <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto">
          {indexing?.recent.length ? indexing.recent.map((job) => {
            const actionable = ["dead_letter", "failed", "retry", "processing"].includes(job.status);
            return <article key={job.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{job.sourceType} · {job.jobType.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">Retry {job.retryCount}/{job.maxRetries} · updated {new Date(job.updatedAt).toLocaleString()}</p></div><div className="flex items-center gap-2"><span className="status-badge capitalize">{job.status.replaceAll("_", " ")}</span>{actionable ? <button type="button" onClick={() => void requeueJob(job.id)} disabled={isRequeueing} className="action-secondary min-h-9 px-3 text-xs">Requeue</button> : null}</div></div>{job.error ? <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">{job.error}</p> : null}</article>;
          }) : <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No indexing jobs loaded.</p>}
        </div>
      </section>

      {readiness ? <section className="enterprise-card p-5"><h3 className="text-lg font-semibold text-slate-950 dark:text-slate-100">Demo readiness</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><StatusTile label="Ready" value={readiness.ready ? "Yes" : "Not yet"} detail={readiness.nextActions[0] ?? "All required checks passed."} tone={readiness.ready ? "ready" : "working"} /><StatusTile label="Diary" value={`${readiness.counts.diaryEntries}`} detail={`${readiness.counts.memoryChunks} searchable chunks`} tone={readiness.counts.memoryChunks ? "ready" : "idle"} /><StatusTile label="Attachments" value={`${readiness.counts.extractedAttachments}/${readiness.counts.attachments}`} detail="Attachments with extracted AI-readable content" tone={readiness.counts.attachments === readiness.counts.extractedAttachments ? "ready" : "working"} /></div></section> : null}
    </div>
  );
}

function Environment({ label, ready, optional = false }: { label: string; ready?: boolean; optional?: boolean }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p><p className={`mt-1 text-xs font-medium ${ready ? "text-emerald-600" : optional ? "text-slate-500" : "text-rose-600"}`}>{ready ? "Ready" : optional ? "Optional / not configured" : "Missing"}</p></div>;
}
