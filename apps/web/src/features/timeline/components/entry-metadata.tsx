import { CalendarDays } from "lucide-react";
import { MOOD_META } from "@/lib/mood-meta";
import {
  formatDiaryDate,
  formatEntryTime,
  getEntryActivityDate,
} from "../timeline-utils";
import type { TimelineEntry } from "../types";

export function EntryMetadata({
  entry,
  isAdmin,
}: {
  entry: TimelineEntry;
  isAdmin: boolean;
}) {
  const activityDate = getEntryActivityDate(entry, isAdmin);
  const moodMeta = entry.mood ? MOOD_META[entry.mood] : null;
  const MoodIcon = moodMeta?.icon;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      {isAdmin ? (
        <span className="font-medium text-slate-400 dark:text-slate-500">
          Memory time
        </span>
      ) : null}
      <time className="font-medium">
        {formatDiaryDate(activityDate)} · {formatEntryTime(activityDate)}
      </time>
      {moodMeta ? (
        <>
          <span
            className="text-slate-300 dark:text-slate-700"
            aria-hidden="true"
          >
            ·
          </span>
          <span
            className={`inline-flex items-center gap-1.5 font-medium ${moodMeta.iconClassName}`}
          >
            {MoodIcon ? (
              <MoodIcon className="h-3.5 w-3.5" aria-hidden="true" />
            ) : null}
            {moodMeta.label}
          </span>
        </>
      ) : null}
      {entry.tags?.map((tag) => (
        <span key={tag} className="text-slate-400 dark:text-slate-500">
          #{tag}
        </span>
      ))}
    </div>
  );
}
