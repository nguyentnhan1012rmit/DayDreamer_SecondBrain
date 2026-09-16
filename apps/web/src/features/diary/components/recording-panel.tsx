"use client";

import { Mic, Square, Trash2 } from "lucide-react";

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

type RecordingPanelProps = {
  isRecording: boolean;
  seconds: number;
  error: string;
  onStart: () => void;
  onStop: () => void;
  onDiscard: () => void;
};

export function RecordingPanel({
  isRecording,
  seconds,
  error,
  onStart,
  onStop,
  onDiscard,
}: RecordingPanelProps) {
  return (
    <div className="flex flex-col gap-4 border-y border-slate-100 py-4 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            isRecording
              ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300"
              : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"
          }`}
        >
          <Mic className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isRecording ? "Recording voice note" : "Voice note"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isRecording
              ? formatRecordingTime(seconds)
              : "Audio will be transcribed and indexed for AI."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isRecording ? (
          <>
            <button
              type="button"
              onClick={onStop}
              className="action-primary bg-rose-600 px-4 hover:bg-rose-700"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
              Stop
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="action-quiet px-3 text-rose-600 dark:text-rose-300"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Discard
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="action-primary px-4"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Start recording
          </button>
        )}
      </div>
      {error ? (
        <p
          className="text-xs font-medium text-rose-600 dark:text-rose-300 sm:basis-full"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
