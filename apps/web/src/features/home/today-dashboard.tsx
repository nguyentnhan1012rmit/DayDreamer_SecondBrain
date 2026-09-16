"use client";

import type { FormEvent } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import type { DiaryEntry, DiaryMood } from "@/lib/api/diary-api";
import type { SummaryRecord } from "@/lib/api/summary-api";
import type { ActivityDay } from "@/features/insights/memory-insights";
import { formatTodayDate } from "./home-formatters";
import { LatestReflectionWidget } from "./widgets/latest-reflection-widget";
import { MemoryQuestionsWidget } from "./widgets/memory-questions-widget";
import { QuickActionsWidget } from "./widgets/quick-actions-widget";
import { TodayCaptureWidget } from "./widgets/today-capture-widget";
import { TodayMemoriesWidget } from "./widgets/today-memories-widget";
import { WeeklyRhythmWidget } from "./widgets/weekly-rhythm-widget";

type TodayDashboardProps = {
  firstName: string;
  captureText: string;
  setCaptureText: (value: string) => void;
  onQuickCapture: (event: FormEvent<HTMLFormElement>) => void;
  todayEntries: DiaryEntry[];
  latestEntry?: DiaryEntry;
  latestSummary?: SummaryRecord;
  isLoading: boolean;
  weekEntries: number;
  activeDays: number;
  streak: number;
  mood: DiaryMood | null;
  recentDays: ActivityDay[];
};

export function TodayDashboard(props: TodayDashboardProps) {
  return (
    <DashboardShell title="Today" description={formatTodayDate()}>
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <TodayCaptureWidget
            firstName={props.firstName}
            captureText={props.captureText}
            todayCount={props.todayEntries.length}
            isLoading={props.isLoading}
            onCaptureTextChange={props.setCaptureText}
            onSubmit={props.onQuickCapture}
          />
          <WeeklyRhythmWidget
            weekEntries={props.weekEntries}
            activeDays={props.activeDays}
            streak={props.streak}
            mood={props.mood}
            recentDays={props.recentDays}
            isLoading={props.isLoading}
          />
        </section>

        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
          <div className="min-w-0">
            <TodayMemoriesWidget entries={props.todayEntries} latestEntry={props.latestEntry} isLoading={props.isLoading} />
            <MemoryQuestionsWidget />
          </div>
          <aside className="space-y-4">
            <LatestReflectionWidget summary={props.latestSummary} isLoading={props.isLoading} />
            <QuickActionsWidget />
          </aside>
        </section>
      </div>
    </DashboardShell>
  );
}
