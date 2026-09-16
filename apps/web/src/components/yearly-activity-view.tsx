"use client";

import { useEffect } from "react";
import {
  getDaysInMonth,
  getDaysInYear,
  toDateKey,
} from "@/lib/yearly-activity";
import { recordClientPerformance } from "@/lib/client-performance";

type YearlyActivityViewProps = {
  days: Array<{ date: string; entryCount: number }>;
  year: number;
  availableYears: number[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
  onSelectYear: (year: number) => void;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function YearlyActivityView({
  days,
  year,
  availableYears,
  selectedDate,
  onSelectDate,
  onSelectYear,
}: YearlyActivityViewProps) {
  const renderStartedAt =
    typeof performance === "undefined" ? 0 : performance.now();
  const entryCounts = new Map(days.map((day) => [day.date, day.entryCount]));
  const yearlyEntryCount = days.reduce(
    (total, day) => total + day.entryCount,
    0,
  );

  useEffect(() => {
    if (!renderStartedAt) return;
    recordClientPerformance(
      "yearly.render",
      performance.now() - renderStartedAt,
    );
  });

  function selectDate(dateKey: string | null) {
    const startedAt = performance.now();
    onSelectDate(dateKey);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        recordClientPerformance(
          "yearly.interaction",
          performance.now() - startedAt,
        ),
      ),
    );
  }

  return (
    <section
      className="enterprise-card p-4 sm:p-5"
      aria-labelledby="yearly-activity-title"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="yearly-activity-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
              Yearly activity
            </h2>
            <span className="status-badge status-badge-success">
              {getDaysInYear(year)} day nodes
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {yearlyEntryCount} entries across {days.length} active days. Select an active day to inspect it below.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Year
          <select
            value={year}
            onChange={(event) => onSelectYear(Number(event.target.value))}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {availableYears.map((availableYear) => (
              <option key={availableYear} value={availableYear}>
                {availableYear}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MONTHS.map((monthLabel, month) => {
          const firstDay = new Date(year, month, 1).getDay();
          const mondayOffset = firstDay === 0 ? 6 : firstDay - 1;
          const daysInMonth = getDaysInMonth(year, month);
          return (
            <div key={monthLabel} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">{monthLabel}</h3>
              <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden="true">
                {WEEKDAYS.map((weekday, index) => (
                  <span key={`${weekday}-${index}`} className="text-center text-[9px] font-semibold text-slate-400">
                    {weekday}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: mondayOffset }, (_, index) => (
                  <span key={`empty-${index}`} className="aspect-square" aria-hidden="true" />
                ))}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const dateKey = toDateKey(year, month, index + 1);
                  const count = entryCounts.get(dateKey) ?? 0;
                  const isSelected = selectedDate === dateKey;
                  const label = `${dateKey}: ${count} ${count === 1 ? "entry" : "entries"}`;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      title={label}
                      aria-label={label}
                      disabled={count === 0}
                      onClick={() => selectDate(isSelected ? null : dateKey)}
                      className={`aspect-square min-h-3 rounded-[3px] transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                        isSelected
                          ? "bg-indigo-700 ring-2 ring-indigo-300 dark:bg-indigo-300"
                          : count > 1
                            ? "cursor-pointer bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-400 dark:hover:bg-indigo-300"
                            : count === 1
                              ? "cursor-pointer bg-indigo-300 hover:bg-indigo-400 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                              : "cursor-default bg-slate-100 dark:bg-slate-800"
                      }`}
                    >
                      <span className="sr-only">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
