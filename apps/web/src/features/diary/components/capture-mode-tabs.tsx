"use client";

import { Camera, FileUp, Mic, PencilLine } from "lucide-react";
import type { CaptureMode } from "@/features/diary/types";

const MODES = [
  { value: "write", label: "Write", icon: PencilLine },
  { value: "record", label: "Record", icon: Mic },
  { value: "photo", label: "Photo", icon: Camera },
  { value: "file", label: "File", icon: FileUp },
] satisfies Array<{
  value: CaptureMode;
  label: string;
  icon: typeof PencilLine;
}>;

type CaptureModeTabsProps = {
  value: CaptureMode;
  isRecording: boolean;
  onChange: (mode: CaptureMode) => void;
};

export function CaptureModeTabs({
  value,
  isRecording,
  onChange,
}: CaptureModeTabsProps) {
  return (
    <div
      className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900"
      role="group"
      aria-label="Capture mode"
    >
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const active = value === mode.value;
        const disabled = isRecording && mode.value !== "record";
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={active}
            aria-label={mode.label}
            title={mode.label}
            disabled={disabled}
            onClick={() => onChange(mode.value)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold transition ${
              active
                ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{mode.label}</span>
            <span className="sr-only sm:hidden">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
