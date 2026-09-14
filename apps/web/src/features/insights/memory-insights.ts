import type { DiaryEntry, DiaryMood } from "@/lib/api/diary-api";
import { MOOD_META } from "@/lib/mood-meta";

export type ActivityDay = { date: Date; count: number };

export type DailyMemorySummary = {
  dateKey: string;
  label: string;
  entries: DiaryEntry[];
  wordCount: number;
  readingMinutes: number;
  topKeywords: string[];
};

export type WeeklyMemorySummary = {
  weekKey: string;
  label: string;
  entries: DiaryEntry[];
  wordCount: number;
  activeDays: number;
  averageWords: number;
  narrative: string;
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "was", "were", "from",
  "have", "has", "had", "about", "into", "our", "you", "your", "today",
  "also", "will", "their", "there",
]);

const weekdayFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const weekFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function getEntryCreatedDate(entry: DiaryEntry) {
  return new Date(entry.createdAt);
}

export function getEntryActivityDate(entry: DiaryEntry) {
  return entry.entryDate ?? entry.createdAt;
}

export function getStartOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function isSameLocalDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

export function getDateKey(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDateInputValue(date = new Date()) {
  return getDateKey(date);
}

export function formatMemoryDay(value: string | Date) {
  return weekdayFormatter.format(new Date(value));
}

export function getLatestEntryDateInputValue(entries: DiaryEntry[]) {
  const latest = [...entries].sort(
    (first, second) =>
      new Date(getEntryActivityDate(second)).getTime()
      - new Date(getEntryActivityDate(first)).getTime(),
  )[0];
  return latest ? getDateKey(getEntryActivityDate(latest)) : null;
}

export function getStartOfWeek(date: Date) {
  const start = getStartOfDay(date);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

export function getRecentActivity(entries: DiaryEntry[], now: Date, days = 7): ActivityDay[] {
  const today = getStartOfDay(now);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    return {
      date,
      count: entries.filter((entry) => isSameLocalDay(getEntryCreatedDate(entry), date)).length,
    };
  });
}

export function getCurrentStreak(entries: DiaryEntry[], now: Date) {
  const activeDates = new Set(entries.map((entry) => getStartOfDay(getEntryCreatedDate(entry)).getTime()));
  const cursor = getStartOfDay(now);
  let streak = 0;
  if (!activeDates.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);
  while (activeDates.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getTopKeywords(entries: DiaryEntry[], limit = 4) {
  const counts = new Map<string, number>();
  entries.forEach((entry) => {
    `${entry.title} ${entry.content}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
      .forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  });
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

export function getTopTags(entries: DiaryEntry[], limit = 5) {
  const counts = new Map<string, number>();
  entries.forEach((entry) => (entry.tags ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function getDominantMood(entries: DiaryEntry[]) {
  const counts = new Map<DiaryMood, number>();
  entries.forEach((entry) => {
    if (entry.mood) counts.set(entry.mood, (counts.get(entry.mood) ?? 0) + 1);
  });
  const dominant = [...counts.entries()].sort((first, second) => second[1] - first[1])[0];
  return dominant ? { mood: dominant[0], label: MOOD_META[dominant[0]].label, count: dominant[1] } : null;
}

export function buildDailySummaries(entries: DiaryEntry[]): DailyMemorySummary[] {
  const grouped = new Map<string, DiaryEntry[]>();
  entries.forEach((entry) => {
    const key = getDateKey(getEntryActivityDate(entry));
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  });
  return [...grouped.entries()].sort(([first], [second]) => second.localeCompare(first)).map(([dateKey, dayEntries]) => {
    const wordCount = dayEntries.reduce((total, entry) => total + countWords(`${entry.title} ${entry.content}`), 0);
    return {
      dateKey,
      label: formatMemoryDay(`${dateKey}T12:00:00`),
      entries: dayEntries,
      wordCount,
      readingMinutes: Math.max(1, Math.ceil(wordCount / 200)),
      topKeywords: getTopKeywords(dayEntries),
    };
  });
}

export function buildWeeklySummaries(entries: DiaryEntry[]): WeeklyMemorySummary[] {
  const grouped = new Map<string, DiaryEntry[]>();
  entries.forEach((entry) => {
    const weekStart = getStartOfWeek(new Date(getEntryActivityDate(entry)));
    const key = getDateKey(weekStart);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  });
  return [...grouped.entries()].sort(([first], [second]) => second.localeCompare(first)).map(([weekKey, weekEntries]) => {
    const start = new Date(`${weekKey}T12:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const wordCount = weekEntries.reduce((total, entry) => total + countWords(`${entry.title} ${entry.content}`), 0);
    const activeDays = new Set(weekEntries.map((entry) => getDateKey(getEntryActivityDate(entry)))).size;
    const themes = getTopKeywords(weekEntries, 3);
    const mood = getDominantMood(weekEntries);
    const cadence = activeDays >= 5 ? "You kept a steady writing rhythm" : activeDays >= 3 ? "You returned to your diary several times" : "You captured a small set of moments";
    const themeSentence = themes.length ? `Your memories kept circling around ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(themes)}.` : "More entries will make the recurring themes clearer.";
    const moodSentence = mood ? `The most common emotional tone was ${mood.label.toLocaleLowerCase()}.` : "Mood was not tagged often enough to show a pattern yet.";
    return {
      weekKey,
      label: `${weekFormatter.format(start)} - ${weekFormatter.format(end)}`,
      entries: weekEntries,
      wordCount,
      activeDays,
      averageWords: Math.round(wordCount / Math.max(activeDays, 1)),
      narrative: `${cadence} across ${activeDays} active day${activeDays === 1 ? "" : "s"}. ${themeSentence} ${moodSentence}`,
    };
  });
}

export function getHomeDashboardInsights(entries: DiaryEntry[], now = new Date()) {
  const weekStart = getStartOfWeek(now);
  const weekEntries = entries.filter((entry) => getEntryCreatedDate(entry) >= weekStart);
  const todayEntries = entries.filter((entry) => isSameLocalDay(getEntryCreatedDate(entry), now));
  const activeDays = new Set(weekEntries.map((entry) => getDateKey(getEntryCreatedDate(entry)))).size;
  const dominantMood = getDominantMood(weekEntries);
  return {
    weekEntries: weekEntries.length,
    todayEntries,
    activeDays,
    mood: dominantMood?.mood ?? null,
    recentDays: getRecentActivity(entries, now),
    streak: getCurrentStreak(entries, now),
  };
}

export function buildWeeklyRhythmNarrative({
  weekEntries,
  activeDays,
  mood,
  recentDays,
}: {
  weekEntries: number;
  activeDays: number;
  mood: DiaryMood | null;
  recentDays: ActivityDay[];
}) {
  if (!weekEntries) return "This week is still open. One honest memory is enough to give it a shape.";
  const busiestDay = [...recentDays].sort((first, second) => second.count - first.count)[0];
  const cadence = activeDays >= 5 ? "You kept a steady thread" : activeDays >= 3 ? "You returned to your memories several times" : "You captured a few meaningful moments";
  const moodSentence = mood ? `The emotional tone leaned ${MOOD_META[mood].label.toLocaleLowerCase()}.` : "Add a mood to make the emotional pattern easier to notice.";
  const busiestSentence = busiestDay?.count && busiestDay.count > 1 ? `Your most reflective day was ${new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(busiestDay.date)}.` : "";
  return `${cadence} across ${activeDays} active day${activeDays === 1 ? "" : "s"}. ${moodSentence} ${busiestSentence}`.trim();
}
