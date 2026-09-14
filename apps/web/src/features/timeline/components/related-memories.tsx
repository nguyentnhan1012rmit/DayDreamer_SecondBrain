import { ArrowRight, Waypoints } from "lucide-react";
import { formatDiaryDate } from "../timeline-utils";
import type { RelatedMemory } from "../types";

export function RelatedMemories({
  memories,
  onOpen,
}: {
  memories: RelatedMemory[];
  onOpen: (id: string) => void;
}) {
  if (!memories.length) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <Waypoints
          className="h-4 w-4 text-indigo-500 dark:text-indigo-300"
          aria-hidden="true"
        />
        Related memories
      </p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {memories.map((related) => (
          <button
            key={related.entry.id}
            type="button"
            onClick={() => onOpen(related.entry.id)}
            className="group/related flex min-h-11 w-full cursor-pointer items-center gap-3 py-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-700 transition group-hover/related:text-indigo-700 dark:text-slate-200 dark:group-hover/related:text-indigo-200">
                {related.entry.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-slate-500">
                {related.reason} · {formatDiaryDate(related.entry.createdAt)}
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-slate-300 transition group-hover/related:translate-x-0.5 group-hover/related:text-indigo-500 dark:text-slate-600"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
