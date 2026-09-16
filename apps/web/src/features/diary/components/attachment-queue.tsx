"use client";

import { getAttachmentStatusClass } from "@/features/diary/diary-utils";
import type { AttachmentQueueItem } from "@/features/diary/types";

type AttachmentQueueProps = {
  items: AttachmentQueueItem[];
  onRemove: (id: string) => void;
};

export function AttachmentQueue({ items, onRemove }: AttachmentQueueProps) {
  if (!items.length) return null;

  return (
    <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
              {item.file.name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {(item.file.size / 1024).toFixed(1)} KB ·{" "}
              {item.file.type || "unknown type"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className={`status-badge ${getAttachmentStatusClass(item.status)}`}
            >
              {item.status}
            </span>
            <span className="max-w-[220px] truncate text-xs text-slate-500 dark:text-slate-400">
              {item.message}
            </span>
            {item.signedUrl ? (
              <a
                href={item.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
              >
                Open
              </a>
            ) : null}
            {item.status === "queued" ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
