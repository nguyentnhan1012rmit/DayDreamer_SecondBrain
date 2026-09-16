import type { AnswerStrategy } from "./search-types";

export const suggestedQuestions = [
  "What did I work on recently?",
  "What important events happened this week?",
  "Summarize my latest diary memories.",
];

export const answerStrategies: Array<{
  value: AnswerStrategy;
  label: string;
}> = [
  { value: "auto", label: "Auto" },
  { value: "fast", label: "Fast" },
  { value: "deep", label: "Deep" },
];

export const confidenceStyles = {
  high: "status-badge-success",
  medium: "status-badge-warning",
  low: "status-badge-danger",
};

export const sourceToneStyles: Record<string, string> = {
  diary:
    "border-indigo-100 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300",
  calendar:
    "border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300",
  contact:
    "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/30 dark:text-fuchsia-300",
  drive:
    "border-lime-100 bg-lime-50 text-lime-700 dark:border-lime-900/50 dark:bg-lime-950/30 dark:text-lime-300",
  gmail:
    "border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300",
  attachment:
    "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  summary:
    "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
};

export const sourceShortLabels: Record<string, string> = {
  diary: "Diary",
  calendar: "Calendar",
  contact: "Contact",
  drive: "Drive",
  gmail: "Gmail",
  attachment: "File",
  summary: "Summary",
};
