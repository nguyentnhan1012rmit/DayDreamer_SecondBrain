import { Info } from "lucide-react";
import { formatModelErrorMessage, formatSourceDate } from "../search-formatters";
import type { ResponseLanguage, SearchResponse } from "../search-types";

export function MemoryStatus({ result, language }: { result: SearchResponse; language: ResponseLanguage }) {
  const issue = result.debugTrace?.diagnostics?.issue;
  const latest = result.debugTrace?.diagnostics?.latestOccurredAt ?? result.sources.map((source) => source.occurredAt).filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const attention = Boolean(result.modelError || (issue && issue !== "none"));
  const empty = Boolean(result.noMemory);
  const tone = empty
    ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
    : attention
      ? "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-300"
      : "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-300";
  const vi = language === "vi";

  const title = empty
    ? vi ? "Chưa tìm thấy memory phù hợp" : "No matching memory found"
    : result.modelError
      ? vi ? "Đang trả lời bằng nguồn đã lưu" : "Answer uses saved sources"
      : attention
        ? vi ? "Memory cần cập nhật" : "Memory needs refresh"
        : vi ? "Memory sẵn sàng" : "Memory is ready";

  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/50">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-600 marker:hidden dark:text-slate-300">
        <Info className="h-4 w-4 text-indigo-500" />
        {vi ? "Chi tiết câu trả lời" : "Answer details"}
        <span className="ml-auto text-xs font-medium text-slate-400">{result.sources.length} sources</span>
      </summary>
      <div className={`mb-2 mt-2 rounded-lg border px-4 py-3 ${tone}`}>
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <StatusItem label={vi ? "Nguồn dùng" : "Sources used"} value={`${result.sources.length}`} />
          <StatusItem label={vi ? "Trạng thái index" : "Index status"} value={!issue || issue === "none" ? (vi ? "Sẵn sàng" : "Ready") : issue.replaceAll("_", " ")} />
          <StatusItem label={vi ? "Memory mới nhất" : "Latest memory"} value={latest ? formatSourceDate(latest) : (vi ? "Chưa có" : "None yet")} />
        </div>
        {result.modelError ? <p className="mt-3 border-t border-current/10 pt-3 text-xs leading-5 opacity-80">{formatModelErrorMessage(result.modelError)}</p> : null}
      </div>
    </details>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-current/10 bg-white/60 px-3 py-2 dark:bg-slate-950/40"><p className="text-xs font-medium opacity-70">{label}</p><p className="mt-1 truncate text-xs font-semibold capitalize">{value}</p></div>;
}
