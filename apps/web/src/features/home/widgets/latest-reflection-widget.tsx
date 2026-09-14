import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { SummaryRecord } from "@/lib/api/summary-api";
import { formatSummaryType } from "../home-formatters";

export function LatestReflectionWidget({ summary, isLoading }: { summary?: SummaryRecord; isLoading: boolean }) {
  return <article className="enterprise-card p-5"><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-300"><Sparkles className="h-5 w-5" /></span>{summary ? <span className="status-badge">{formatSummaryType(summary.type)}</span> : null}</div><h2 className="mt-4 text-lg font-semibold text-slate-950 dark:text-white">Latest reflection</h2>{isLoading ? <div className="mt-4 space-y-2"><div className="skeleton-line h-4 w-full" /><div className="skeleton-line h-4 w-5/6" /></div> : <p className="mt-3 line-clamp-5 text-sm leading-6 text-slate-600 dark:text-slate-300">{summary?.content ?? "Your next reflection will appear after your memories are summarized."}</p>}<Link href="/summary" className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-pink-600 hover:text-pink-800 dark:text-pink-300">Open summary<ArrowRight className="h-4 w-4" /></Link></article>;
}
