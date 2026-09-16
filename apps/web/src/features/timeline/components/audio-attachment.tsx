"use client";

import { Play } from "lucide-react";
import type { DiaryAttachment } from "@/lib/api/attachment-api";
import type { AudioPlaybackState } from "../hooks/use-audio-playback";

export function AudioAttachment({
  attachment,
  label,
  source,
  state,
  error,
  onError,
  onLoadedMetadata,
  onLoad,
  onRetry,
}: {
  attachment: DiaryAttachment;
  label: string;
  source?: string;
  state: AudioPlaybackState;
  error?: string;
  onError: (error: MediaError | null) => void;
  onLoadedMetadata: (duration: number) => void;
  onLoad: () => void;
  onRetry: () => void;
}) {
  const showPlayer =
    Boolean(source) && state !== "retrying" && state !== "error";

  return (
    <>
      {source ? (
        <audio
          key={source}
          controls
          preload="metadata"
          src={source}
          onError={(event) => onError(event.currentTarget.error)}
          onLoadedMetadata={(event) =>
            onLoadedMetadata(event.currentTarget.duration)
          }
          aria-label={`Play ${label}`}
          className={showPlayer ? "h-9 w-full" : "hidden"}
        >
          Your browser does not support audio playback.
        </audio>
      ) : null}

      <div
        className={state === "ready" ? "sr-only" : "mt-2"}
        aria-live="polite"
      >
        {state === "idle" ? (
          <button
            type="button"
            onClick={onLoad}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Load audio
          </button>
        ) : null}
        {state === "loading" ? (
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500 dark:border-slate-600 dark:border-t-indigo-400"
              aria-hidden="true"
            />
            Loading audio
          </p>
        ) : null}
        {state === "retrying" ? (
          <p className="flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-sky-600 dark:border-sky-700 dark:border-t-sky-300"
              aria-hidden="true"
            />
            Retrying audio
          </p>
        ) : null}
        {state === "error" ? (
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs dark:border-rose-900/60 dark:bg-rose-950/30">
            <span className="font-medium text-rose-700 dark:text-rose-300">
              Playback unavailable
              {error ? (
                <span className="mt-0.5 block font-normal">{error}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-rose-300 bg-white px-3 font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/40"
            >
              Retry
            </button>
          </div>
        ) : null}
        {state === "ready"
          ? `Audio ready to play: ${attachment.fileName}`
          : null}
      </div>
    </>
  );
}
