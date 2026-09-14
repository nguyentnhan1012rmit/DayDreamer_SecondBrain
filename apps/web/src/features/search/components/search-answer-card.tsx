import Link from "next/link";
import { MessageSquareText, Sparkles } from "lucide-react";
import { confidenceStyles, suggestedQuestions } from "../search-config";
import type { ResponseLanguage, SearchResponse } from "../search-types";
import { AiDebugPanel } from "./ai-debug-panel";
import { MemoryStatus } from "./memory-status";

type SearchAnswerCardProps = {
  result: SearchResponse | null;
  isSearching: boolean;
  language: ResponseLanguage;
  isAdmin: boolean;
  showDebug: boolean;
  onShowDebugChange: (value: boolean) => void;
  onReset: () => void;
  onQuestionChange: (value: string) => void;
};

export function SearchAnswerCard({ result, isSearching, language, isAdmin, showDebug, onShowDebugChange, onReset, onQuestionChange }: SearchAnswerCardProps) {
  return (
    <section className="enterprise-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><p className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300"><Sparkles className="h-4 w-4" />Answer</p><h3 className="mt-1.5 text-xl font-semibold text-slate-950 dark:text-slate-100">From your memories</h3></div>
        {result ? <div className="flex flex-wrap items-center gap-2"><span className={`status-badge ${confidenceStyles[result.confidence]}`}>{result.confidence} confidence</span>{isAdmin ? <label className="status-badge cursor-pointer"><input type="checkbox" checked={showDebug} onChange={(event) => onShowDebugChange(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />Show AI debug</label> : null}</div> : null}
      </div>

      {isSearching ? <SearchLoading /> : result?.noMemory ? <NoMemory language={language} answer={result.answer} onReset={onReset} onQuestionChange={onQuestionChange} /> : result ? <div className="border-l-4 border-indigo-500 py-1 pl-4 pr-2"><p className="whitespace-pre-wrap text-base leading-8 text-slate-800 dark:text-slate-200">{result.answer}</p></div> : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-700"><MessageSquareText className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-200">No answer yet</p><p className="mt-1 text-sm text-slate-500">Submit a question to see the AI answer here.</p></div>}

      {result ? <MemoryStatus result={result} language={language} /> : null}
      {result && isAdmin && showDebug ? <AiDebugPanel result={result} /> : null}
    </section>
  );
}

function SearchLoading() {
  return <div className="space-y-3"><p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Searching grounded memories</p>{["Embed query", "Retrieve sources", "Ground answer"].map((step) => <div key={step} className="enterprise-panel p-3"><p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{step}</p><div className="skeleton-line mt-3 h-2" /></div>)}</div>;
}

function NoMemory({ language, answer, onReset, onQuestionChange }: { language: ResponseLanguage; answer: string; onReset: () => void; onQuestionChange: (value: string) => void }) {
  const vi = language === "vi";
  return <div className="space-y-4"><div className="rounded-lg border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-700/60 dark:bg-amber-900/20"><p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{vi ? "Không tìm thấy memory phù hợp" : "No relevant memories found"}</p><p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{answer}</p></div><div className="grid gap-2 sm:grid-cols-3"><Link href="/diary" className="action-secondary justify-center">{vi ? "Thêm nhật ký" : "Add diary entry"}</Link><button type="button" onClick={onReset} className="action-secondary">{vi ? "Viết lại câu hỏi" : "Rephrase question"}</button><button type="button" onClick={() => onQuestionChange(suggestedQuestions[0])} className="action-secondary">{vi ? "Dùng câu hỏi gợi ý" : "Use suggestion"}</button></div></div>;
}
