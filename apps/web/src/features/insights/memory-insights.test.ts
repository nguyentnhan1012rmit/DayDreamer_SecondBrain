import assert from "node:assert/strict";
import test from "node:test";
import type { DiaryEntry } from "@/lib/api/diary-api";
import {
  buildDailySummaries,
  buildWeeklyRhythmNarrative,
  getCurrentStreak,
  getHomeDashboardInsights,
} from "./memory-insights.ts";

function entry(id: string, createdAt: string, content = "A useful capstone memory"): DiaryEntry {
  return { id, title: `Entry ${id}`, content, createdAt, updatedAt: createdAt, mood: "good", tags: ["capstone"] };
}

test("home insights use created time and deterministic now", () => {
  const entries = [entry("a", "2026-08-25T09:00:00+07:00"), entry("b", "2026-08-24T09:00:00+07:00")];
  const insights = getHomeDashboardInsights(entries, new Date("2026-08-25T18:00:00+07:00"));
  assert.equal(insights.todayEntries.length, 1);
  assert.equal(insights.weekEntries, 2);
  assert.equal(insights.streak, 2);
});

test("daily summaries aggregate entries and words", () => {
  const summaries = buildDailySummaries([entry("a", "2026-08-24T09:00:00+07:00"), entry("b", "2026-08-24T13:00:00+07:00")]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.entries.length, 2);
  assert.ok((summaries[0]?.wordCount ?? 0) > 0);
});

test("weekly narrative explains an empty week", () => {
  assert.match(buildWeeklyRhythmNarrative({ weekEntries: 0, activeDays: 0, mood: null, recentDays: [] }), /still open/i);
});

test("streak falls back to yesterday when today is empty", () => {
  const entries = [entry("a", "2026-08-23T09:00:00+07:00")];
  assert.equal(getCurrentStreak(entries, new Date("2026-08-24T18:00:00+07:00")), 1);
});
