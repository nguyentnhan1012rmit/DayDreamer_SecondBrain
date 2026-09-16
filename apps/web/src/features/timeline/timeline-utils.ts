import type { DiaryCalendarEvent } from "@/lib/api/calendar-api";
import type { TimelineEntry } from "./types";

export function formatEventTime(event: DiaryCalendarEvent) {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  return `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function getEntryActivityDate(entry: TimelineEntry, isAdmin: boolean) {
  void isAdmin;
  return entry.entryDate ?? entry.createdAt;
}

export function isDifferentTimestamp(
  first: Date | string,
  second: Date | string,
) {
  return new Date(first).getTime() !== new Date(second).getTime();
}

export function formatDiaryDate(value: Date | string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatEntryTime(value: Date | string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getTimelineGroup(value: Date | string, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return { key: "earlier", label: "Earlier" };
  }

  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (day.getTime() === today.getTime()) {
    return { key: "today", label: "Today" };
  }
  if (day.getTime() === yesterday.getTime()) {
    return { key: "yesterday", label: "Yesterday" };
  }

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(weekStart.getDate() + 7);
  if (day >= weekStart && day < nextWeekStart) {
    return { key: "this-week", label: "This week" };
  }

  return {
    key: `${date.getFullYear()}-${date.getMonth()}`,
    label: date.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    }),
  };
}
