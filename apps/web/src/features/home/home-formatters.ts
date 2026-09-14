import type { DiaryEntry } from "@/lib/api/diary-api";
import type { SummaryRecord } from "@/lib/api/summary-api";
import { getEntryCreatedDate } from "@/features/insights/memory-insights";

export function getGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function formatMemoryDate(entry: DiaryEntry) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(getEntryCreatedDate(entry));
}

export function formatCreatedTime(entry: DiaryEntry) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(getEntryCreatedDate(entry));
}

export function formatTodayDate(now = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

export function formatSummaryType(type: SummaryRecord["type"]) {
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} reflection`;
}
