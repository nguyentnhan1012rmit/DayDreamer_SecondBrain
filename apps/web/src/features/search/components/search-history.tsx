import { ChevronDown, Clock3, Search, X } from "lucide-react";
import type { SearchHistoryEntry } from "../search-types";

type SearchHistoryProps = {
  items: SearchHistoryEntry[];
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  onSelect: (question: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
};

export function SearchHistory({ items, expanded, onExpandedChange, onSelect, onDelete, onClear }: SearchHistoryProps) {
  if (!items.length) return null;

  return (
    <section className="mt-6 enterprise-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => onExpandedChange(!expanded)} className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-indigo-700 dark:text-slate-200">
          <Clock3 className="h-4 w-4 text-slate-400" />
          Recent Searches
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        <button type="button" onClick={onClear} className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-rose-500">Clear All</button>
      </div>
      {expanded ? (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="group flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-indigo-200 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900/40">
              <button type="button" onClick={() => onSelect(item.question)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-xs text-slate-600 hover:text-indigo-700 dark:text-slate-300">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{item.question}</span>
                <span className="ml-auto shrink-0 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
              </button>
              <button type="button" onClick={() => onDelete(item.id)} className="ml-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-slate-400 opacity-100 transition hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" aria-label="Delete search history item">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
