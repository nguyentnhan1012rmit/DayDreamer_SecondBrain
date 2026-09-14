import type { AnswerMode, SearchCitation, SearchResponse } from "./search-types";

export function formatSourceDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatAnswerMode(value?: AnswerMode) {
  const labels: Record<AnswerMode, string> = {
    cache: "Cache",
    fast_path: "Fast path",
    tuturuuu: "Tuturuuu AI",
    extractive_fallback: "Extractive fallback",
    no_memory: "No memory",
  };
  return value ? labels[value] : "Unknown";
}

export function formatModelErrorMessage(
  error: NonNullable<SearchResponse["modelError"]>,
) {
  if (error.kind === "quota" || error.kind === "billing") {
    return "AI generation is temporarily unavailable because the model account needs attention. Retrieved evidence is still available.";
  }
  if (error.kind === "validation") {
    return "The generated answer did not pass grounding validation, so direct evidence is shown instead.";
  }
  return error.message;
}

export function cleanSourceTitle(value?: string) {
  return value?.trim() || undefined;
}

export function getSourceHref(source: SearchCitation) {
  if (source.sourceType === "attachment") {
    return `/timeline#attachment-${source.sourceId}`;
  }
  if (source.sourceType === "diary") {
    return `/timeline#entry-${source.sourceId}`;
  }
  if (source.sourceType === "calendar") return "/timeline";
  return null;
}

export function formatPercent(value?: number | null) {
  return value == null ? "n/a" : `${Math.round(value * 100)}%`;
}

export function formatDurationMs(value?: number | null) {
  if (value == null) return "n/a";
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}
