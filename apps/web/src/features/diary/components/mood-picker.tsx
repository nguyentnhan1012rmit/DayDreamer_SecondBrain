"use client";

import { MOOD_OPTIONS } from "@/lib/mood-meta";
import type { DiaryMood } from "@/lib/api/diary-api";

type MoodPickerProps = {
  value: DiaryMood;
  onChange: (mood: DiaryMood) => void;
};

export function MoodPicker({ value, onChange }: MoodPickerProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
        Mood
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MOOD_OPTIONS.map((option) => {
          const selected = value === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`min-h-14 rounded-lg border px-3 py-2.5 text-left transition ${
                selected
                  ? `${option.className} ring-2 ring-indigo-300 dark:ring-indigo-600`
                  : "border-slate-200 bg-white/70 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/30 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20"
              }`}
              aria-pressed={selected}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {option.label}
              </span>
              <span className="mt-1 block text-xs opacity-75">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
