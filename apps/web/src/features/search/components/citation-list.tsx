import { CheckCircle2 } from "lucide-react";
import type { SearchCitation } from "../search-types";
import { CitationCard } from "./citation-card";

export function CitationList({ sources, onAskSource }: { sources: SearchCitation[]; onAskSource: (source: SearchCitation) => void }) {
  return (
    <section className="mt-6 enterprise-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div><p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Sources</p><h3 className="mt-1.5 text-xl font-semibold text-slate-950 dark:text-slate-100">Behind this answer</h3></div>
        <span className="status-badge">{sources.length} sources</span>
      </div>
      {sources.length ? <div className="grid gap-3 lg:grid-cols-2">{sources.map((source) => <CitationCard key={`${source.marker}-${source.chunkId}`} source={source} onAskSource={onAskSource} />)}</div> : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-600">Citations will appear here after a successful search.</div>}
    </section>
  );
}
