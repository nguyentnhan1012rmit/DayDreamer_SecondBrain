"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { formatAnswerMode, formatDurationMs, formatPercent, formatSourceDate } from "../search-formatters";
import type { SearchResponse } from "../search-types";

export function AiDebugPanel({ result }: { result: SearchResponse }) {
  const [copied, setCopied] = useState(false);
  const analytics = result.analytics;
  const trace = result.debugTrace;
  const chunks = trace?.topChunks?.length ? trace.topChunks.slice(0, 5) : result.sources.slice(0, 5).map((source) => ({ ...source, id: source.chunkId, retrievalMode: "citation", vectorSimilarity: source.similarity, lexicalScore: 0, entityScore: 0 }));

  async function copyTrace() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ result, copiedAt: new Date().toISOString() }, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">AI Debug</p><h4 className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-100">Search pipeline visibility</h4></div>
        <button type="button" onClick={() => void copyTrace()} className="status-badge cursor-pointer"><Copy className="h-3.5 w-3.5" />{copied ? "Copied trace" : "Copy debug trace"}</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DebugMetric label="Mode" value={formatAnswerMode(result.answerMode ?? analytics?.answerMode)} />
        <DebugMetric label="Latency" value={formatDurationMs(analytics?.timing.totalMs)} />
        <DebugMetric label="Tokens" value={`${analytics?.tokenUsage.totalTokens ?? "n/a"}`} />
        <DebugMetric label="Trace" value={trace ? trace.status : "missing"} />
      </div>
      {trace?.routingTrace ? <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/20"><p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Routing: {trace.routingTrace.selectedPath.replaceAll("_", " ")}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{trace.routingTrace.reason}</p></div> : null}
      {result.modelError ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">Model error: {result.modelError.message}</div> : null}
      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Retrieved evidence</p>
        {chunks.map((chunk, index) => (
          <article key={`${chunk.id}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500"><strong className="text-slate-800 dark:text-slate-200">#{index + 1} {chunk.sourceTitle || chunk.sourceType}</strong><span>{formatSourceDate(chunk.occurredAt)}</span><span>{formatPercent(chunk.similarity)} match</span></div>
            <blockquote className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{chunk.quote}</blockquote>
          </article>
        ))}
      </div>
      {trace ? <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">Advanced filters JSON</summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify({ inferred: trace.inferredFilters, applied: trace.appliedFilters }, null, 2)}</pre></details> : null}
    </section>
  );
}

function DebugMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-semibold capitalize text-slate-950 dark:text-slate-100">{value}</p></div>;
}
