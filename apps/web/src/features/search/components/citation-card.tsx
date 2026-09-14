import Link from "next/link";
import {
  BookOpenText,
  CalendarDays,
  ExternalLink,
  FileText,
  Mail,
  MessageCircleQuestion,
  Paperclip,
} from "lucide-react";
import { sourceShortLabels, sourceToneStyles } from "../search-config";
import { cleanSourceTitle, formatPercent, formatSourceDate, getSourceHref } from "../search-formatters";
import type { SearchCitation } from "../search-types";

export function CitationCard({ source, onAskSource }: { source: SearchCitation; onAskSource: (source: SearchCitation) => void }) {
  const href = getSourceHref(source);
  const title = cleanSourceTitle(source.sourceTitle) || `${sourceShortLabels[source.sourceType] || source.sourceType} memory`;
  const tone = sourceToneStyles[source.sourceType] || "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone}`}><SourceIcon sourceType={source.sourceType} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="status-badge">{source.marker}</span><span className="text-xs font-medium capitalize text-slate-500">{sourceShortLabels[source.sourceType] || source.sourceType}</span></div>
          <h4 className="mt-2 truncate text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{formatSourceDate(source.occurredAt)} · {source.chunkType.replaceAll("_", " ")}</p>
        </div>
      </div>
      <blockquote className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:bg-slate-900 dark:text-slate-300">{source.quote}</blockquote>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-[11px] font-medium text-slate-400">{formatPercent(source.similarity)} match</span>
        <div className="flex flex-wrap gap-2">
          {source.sourceType === "attachment" ? <button type="button" onClick={() => onAskSource(source)} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300"><MessageCircleQuestion className="h-4 w-4" />Ask follow-up</button> : null}
          {href ? <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"><ExternalLink className="h-4 w-4" />View memory</Link> : null}
        </div>
      </div>
    </article>
  );
}

function SourceIcon({ sourceType }: { sourceType: string }) {
  const props = { className: "h-5 w-5", "aria-hidden": true } as const;
  if (sourceType === "calendar") return <CalendarDays {...props} />;
  if (sourceType === "gmail") return <Mail {...props} />;
  if (sourceType === "attachment") return <Paperclip {...props} />;
  if (sourceType === "diary") return <BookOpenText {...props} />;
  return <FileText {...props} />;
}
