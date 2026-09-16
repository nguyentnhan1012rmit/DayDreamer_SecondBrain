"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import type { SavedReflection } from "@/features/diary/types";

type ReflectDeeperProps = {
  reflection: SavedReflection | null;
  isLoading: boolean;
  isSaving: boolean;
  onFollowUp: (reflection: SavedReflection) => void;
};

export function ReflectDeeper({
  reflection,
  isLoading,
  isSaving,
  onFollowUp,
}: ReflectDeeperProps) {
  if (!reflection || isSaving) return null;

  return (
    <section
      className="enterprise-card mt-4 overflow-hidden"
      aria-labelledby="reflect-deeper-heading"
      aria-live="polite"
    >
      <div className="flex gap-4 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="reflect-deeper-heading"
              className="text-sm font-semibold text-indigo-700 dark:text-indigo-300"
            >
              Reflect deeper
            </h2>
            {isLoading ? (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Personalizing...
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-base leading-7 text-slate-800 dark:text-slate-200">
            {reflection.question}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onFollowUp(reflection)}
              className="action-primary px-4"
            >
              Write a follow-up
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <a
              href={`/timeline#entry-${reflection.entryId}`}
              className="action-quiet min-h-10 px-2 text-indigo-600 dark:text-indigo-300"
            >
              View saved memory
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
