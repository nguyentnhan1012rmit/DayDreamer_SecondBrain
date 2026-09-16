"use client";

import { useState } from "react";
import { formatDateTime } from "@second-brain/shared";
import { CalendarDays, Clock3, PencilLine, Trash2 } from "lucide-react";
import { MOOD_META } from "@/lib/mood-meta";
import {
  formatEventTime,
  getEntryActivityDate,
  isDifferentTimestamp,
} from "../timeline-utils";
import type { RelatedMemory, TimelineEntry } from "../types";
import { AttachmentList } from "./attachment-list";
import { EntryMetadata } from "./entry-metadata";
import { RelatedMemories } from "./related-memories";

type TimelineEntryCardProps = {
  entry: TimelineEntry;
  entryNumber?: number;
  isAdmin: boolean;
  relatedMemories: RelatedMemory[];
  onEdit?: (entry: TimelineEntry) => void;
  onDelete?: (entry: TimelineEntry) => void;
  onOpenRelated: (id: string) => void;
  onLoadAttachmentAudio?: (attachmentId: string) => Promise<string | Blob>;
  onOpenAttachment?: (attachmentId: string) => Promise<string | Blob>;
  onProcessAttachment?: (attachmentId: string) => Promise<void>;
  onFeedback: (type: "success" | "error", message: string) => void;
};

export function TimelineEntryCard({
  entry,
  entryNumber,
  isAdmin,
  relatedMemories,
  onEdit,
  onDelete,
  onOpenRelated,
  onLoadAttachmentAudio,
  onOpenAttachment,
  onProcessAttachment,
  onFeedback,
}: TimelineEntryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const activityDate = getEntryActivityDate(entry, isAdmin);
  const showCreatedDate = isDifferentTimestamp(activityDate, entry.createdAt);
  const shouldClamp = entry.content.trim().length > 360;
  const moodMeta = entry.mood ? MOOD_META[entry.mood] : null;
  const MoodIcon = moodMeta?.icon;

  return (
    <li className="relative pl-10">
      <div
        className={`absolute left-0 top-5 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white dark:border-slate-950 ${moodMeta ? `${moodMeta.className} shadow-sm` : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
        title={moodMeta?.label ?? "Diary memory"}
      >
        {MoodIcon ? (
          <MoodIcon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </div>

      <article
        id={`entry-${entry.id}`}
        tabIndex={-1}
        className="group relative enterprise-card p-4 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 hover:border-slate-300 dark:focus:ring-indigo-900 dark:hover:border-slate-700"
      >
        {isAdmin && entryNumber ? (
          <div className="absolute -top-3 right-6 flex items-center gap-2">
            <span className="status-badge">Entry #{entryNumber}</span>
          </div>
        ) : null}

        <header className="mb-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold leading-7 text-slate-900 dark:text-slate-100">
              {entry.title}
            </h3>
            {onEdit || onDelete ? (
              <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(entry)}
                    className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
                    title="Edit entry"
                    aria-label={`Edit ${entry.title}`}
                  >
                    <PencilLine className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(entry)}
                    className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                    title="Delete entry"
                    aria-label={`Delete ${entry.title}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <EntryMetadata entry={entry} isAdmin={isAdmin} />
        </header>

        <div className="relative">
          <div
            className={`absolute bottom-0 left-0 top-0 w-1 rounded-full ${moodMeta?.railClassName ?? "bg-slate-300 dark:bg-slate-600"}`}
          />
          <p
            className={`pl-4 text-sm leading-7 text-slate-700 dark:text-slate-300 ${shouldClamp && !isExpanded ? "line-clamp-4" : ""}`}
          >
            {entry.content}
          </p>
          {shouldClamp ? (
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className="mt-2 cursor-pointer pl-4 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-100"
            >
              {isExpanded ? "Show less" : "View more"}
            </button>
          ) : null}
        </div>

        {entry.calendarEvents?.length ? (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
            <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Calendar
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {entry.calendarEvents.map((event) => {
                const content = (
                  <>
                    <CalendarDays
                      className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {event.title}
                    </span>
                    <span className="shrink-0 text-slate-500 dark:text-slate-400">
                      {formatEventTime(event)}
                    </span>
                  </>
                );
                return event.htmlLink ? (
                  <a
                    key={event.id}
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 border-l-2 border-cyan-300 px-3 py-2 text-xs text-slate-700 transition hover:bg-cyan-50/60 dark:border-cyan-800 dark:text-slate-300 dark:hover:bg-cyan-950/20"
                  >
                    {content}
                  </a>
                ) : (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 border-l-2 border-cyan-300 px-3 py-2 text-xs text-slate-700 dark:border-cyan-800 dark:text-slate-300"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {entry.attachments?.length ? (
          <AttachmentList
            attachments={entry.attachments}
            onLoadAttachmentAudio={onLoadAttachmentAudio}
            onOpenAttachment={onOpenAttachment}
            onProcessAttachment={onProcessAttachment}
            onFeedback={onFeedback}
          />
        ) : null}

        <RelatedMemories memories={relatedMemories} onOpen={onOpenRelated} />

        {isAdmin && showCreatedDate ? (
          <footer className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-[11px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Created {formatDateTime(entry.createdAt)}</span>
          </footer>
        ) : null}
      </article>
    </li>
  );
}
