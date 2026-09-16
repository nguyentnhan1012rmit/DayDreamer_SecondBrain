"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, FileUp, LockKeyhole, Paperclip } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { readHomeDraft, storeHomeDraft } from "@/lib/home-draft";
import { copilotDiaryText } from "@/lib/api/diary-api";
import {
  getCalendarEvents,
  type CalendarEventRecord,
} from "@/lib/api/calendar-api";
import { CaptureModeTabs } from "@/features/diary/components/capture-mode-tabs";
import { MoodPicker } from "@/features/diary/components/mood-picker";
import { TagInput } from "@/features/diary/components/tag-input";
import { RecordingPanel } from "@/features/diary/components/recording-panel";
import { AttachmentQueue } from "@/features/diary/components/attachment-queue";
import { ReflectDeeper } from "@/features/diary/components/reflect-deeper";
import { useAttachmentQueue } from "@/features/diary/hooks/use-attachment-queue";
import { useRecorder } from "@/features/diary/hooks/use-recorder";
import { useDiarySubmit } from "@/features/diary/hooks/use-diary-submit";
import {
  createInitialDiaryDraft,
  getLocalDateInputValue,
} from "@/features/diary/diary-utils";
import type {
  CaptureMode,
  DiaryDraft,
  SavedReflection,
} from "@/features/diary/types";

function isSameLocalDate(isoDate: string, localDate: string) {
  return getLocalDateInputValue(new Date(isoDate)) === localDate;
}

function formatCompactEventTime(event: CalendarEventRecord) {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${timeFormat.format(start)}-${timeFormat.format(end)}`;
}

interface TemplateItem {
  id: string;
  name: string;
  icon: string;
  title: string;
  content: string;
  description: string;
}

const TEMPLATES_EN: TemplateItem[] = [
  {
    id: "brain-dump",
    name: "Brain Dump",
    icon: "💡",
    description: "Capture knowledge & ideas",
    title: "Brain Dump & Knowledge Capture",
    content: [
      "🧠 The biggest lesson I learned today (in one sentence):",
      "- ",
      "",
      "📌 Key facts, quotes, or ideas I want to remember:",
      "- ",
      "",
      "🔗 How can I connect this knowledge to my current projects or goals?",
      "- ",
      "",
      "🔍 Topics I want to explore further in the future:",
      "- ",
    ].join("\n"),
  },
  {
    id: "stoic-reflection",
    name: "Mindful Reflection",
    icon: "🧘",
    description: "Process emotions & thoughts",
    title: "Mindful & Stoic Reflection",
    content: [
      "⛈️ What is weighing on my mind or causing me stress right now?",
      "- ",
      "",
      "⚖️ What is WITHIN my control vs. OUTSIDE my control in this situation?",
      "- Within my control: ",
      "- Outside my control: ",
      "",
      "🌟 What is one positive thing I can focus on despite the challenges?",
      "- ",
      "",
      "🕊️ If I look back at this situation a year from now, what would I tell myself?",
      "- ",
    ].join("\n"),
  },
  {
    id: "five-minute",
    name: "5-Minute Journal",
    icon: "🎯",
    description: "Start & end day with purpose",
    title: "The 5-Minute Setup & Review",
    content: [
      "☀️ MORNING — Setting Intentions",
      "",
      "3 things I am grateful for today:",
      "1. ",
      "2. ",
      "3. ",
      "",
      "The ONE task that will make today a great day:",
      "- ",
      "",
      "An affirmation or mindset I want to carry today:",
      "- ",
      "",
      "🌙 EVENING — Reflection",
      "",
      "The biggest obstacle I faced today and how I handled it:",
      "- ",
      "",
      "One thing I could do better tomorrow:",
      "- ",
    ].join("\n"),
  },
  {
    id: "project-review",
    name: "Project Review",
    icon: "🚀",
    description: "Track progress & blockers",
    title: "Project Progress & Review",
    content: [
      "📈 Progress — What did I accomplish or move forward today?",
      "- ",
      "",
      "🚧 Blockers — What challenges or obstacles did I encounter?",
      "- ",
      "",
      "💡 Insights — Any new ideas, solutions, or 'aha' moments?",
      "- ",
      "",
      "📋 Next Steps — What are my priorities for tomorrow?",
      "- ",
    ].join("\n"),
  },
];

export function DiaryInputForm() {
  const { getAccessToken, isAuthenticated } = useAuth();
  const [draft, setDraft] = useState<DiaryDraft>(createInitialDiaryDraft);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [activeCopilotAction, setActiveCopilotAction] = useState("");
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRecord[]>(
    [],
  );
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("write");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentQueue = useAttachmentQueue({ captureMode, setDraft });
  const recorder = useRecorder({
    onRecordingReady: (file) => attachmentQueue.queueFiles([file], "record"),
  });
  const diarySubmit = useDiarySubmit({
    draft,
    attachments: attachmentQueue.items,
    isRecording: recorder.isRecording,
    isAuthenticated,
    getAccessToken,
    updateAttachment: attachmentQueue.updateItem,
    resetDraft: () => setDraft(createInitialDiaryDraft()),
  });
  const {
    canSubmit,
    state,
    errorMessage,
    showAuthPrompt,
    savedReflection,
    isReflectionLoading,
    setErrorMessage,
  } = diarySubmit;

  useEffect(() => {
    const homeDraft = readHomeDraft();
    if (!homeDraft) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setDraft(homeDraft);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated || (!draft.title.trim() && !draft.content.trim()))
      return;
    storeHomeDraft(draft);
  }, [draft, isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    async function loadCalendarPreview() {
      if (!isAuthenticated) {
        setCalendarEvents([]);
        return;
      }

      setIsCalendarLoading(true);
      try {
        const events = await getCalendarEvents(getAccessToken());
        if (!cancelled) setCalendarEvents(events);
      } catch {
        if (!cancelled) setCalendarEvents([]);
      } finally {
        if (!cancelled) setIsCalendarLoading(false);
      }
    }

    void loadCalendarPreview();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isAuthenticated]);

  const activeTemplates = TEMPLATES_EN;

  const linkedCalendarEvents = useMemo(() => {
    return calendarEvents
      .filter((event) => isSameLocalDate(event.startTime, draft.entryDate))
      .slice(0, 3);
  }, [calendarEvents, draft.entryDate]);

  async function handleCopilotAction(action: string) {
    if (!draft.content.trim()) return;

    // Require auth to use Copilot
    if (!isAuthenticated) {
      diarySubmit.requestAuthentication();
      return;
    }

    setIsCopilotLoading(true);
    setActiveCopilotAction(action);
    setErrorMessage("");
    diarySubmit.resetFeedback();

    try {
      const accessToken = getAccessToken();
      const response = await copilotDiaryText(
        { text: draft.content, action },
        accessToken,
      );

      if (!response.result) {
        setErrorMessage("AI returned an empty response. Please try again.");
        return;
      }

      if (action === "continue") {
        setDraft((prev) => ({
          ...prev,
          content: prev.content.trimEnd() + " " + response.result,
        }));
      } else {
        setDraft((prev) => ({
          ...prev,
          content: response.result,
        }));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Copilot request failed",
      );
    } finally {
      setIsCopilotLoading(false);
      setActiveCopilotAction("");
    }
  }

  const wordCount = useMemo(() => {
    return draft.content.trim().split(/\s+/).filter(Boolean).length;
  }, [draft.content]);

  function applyTemplate(template: TemplateItem) {
    if (
      draft.content.trim() &&
      !window.confirm("This will overwrite your current entry. Are you sure?")
    ) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      title: template.title,
      content: template.content,
    }));
    setErrorMessage("");
  }

  function startFollowUp(reflection: SavedReflection) {
    setCaptureMode("write");
    setDraft({
      ...createInitialDiaryDraft(),
      title: `Reflection on ${reflection.entryTitle}`,
      content: `${reflection.question}\n\n`,
      mood: reflection.mood,
    });
    attachmentQueue.clear();
    diarySubmit.resetFeedback();
    diarySubmit.dismissReflection();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="w-full">
      <form
        className="enterprise-card space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void diarySubmit.submit();
        }}
      >
        <CaptureModeTabs
          value={captureMode}
          isRecording={recorder.isRecording}
          onChange={(mode) => {
            setCaptureMode(mode);
            recorder.clearError();
          }}
        />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <label
              htmlFor="title"
              className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Title
            </label>
            <input
              id="title"
              autoFocus
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
              placeholder="What happened today?"
              value={draft.title}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, title: event.target.value }))
              }
            />
          </div>

          <div>
            <label
              htmlFor="entryDate"
              className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Date
            </label>
            <input
              id="entryDate"
              type="date"
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
              value={draft.entryDate}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, entryDate: event.target.value }))
              }
            />
          </div>
        </div>

        <MoodPicker
          value={draft.mood}
          onChange={(mood) => setDraft((current) => ({ ...current, mood }))}
        />

        <TagInput
          value={draft.tags}
          onChange={(tags) => setDraft((current) => ({ ...current, tags }))}
        />

        {(isCalendarLoading || linkedCalendarEvents.length > 0) && (
          <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/60 dark:bg-sky-950/30">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 dark:text-sky-200">
              <span className="font-semibold">Calendar context</span>
              {isCalendarLoading ? (
                <span className="text-sky-600 dark:text-sky-300">
                  Loading synced events...
                </span>
              ) : (
                linkedCalendarEvents.map((event) => (
                  <a
                    key={event.id}
                    href={event.htmlLink ?? undefined}
                    target={event.htmlLink ? "_blank" : undefined}
                    rel={event.htmlLink ? "noopener noreferrer" : undefined}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-100 bg-white px-2.5 py-1 font-medium text-sky-700 transition hover:bg-white dark:border-sky-900/60 dark:bg-slate-950 dark:text-sky-200"
                  >
                    <span className="truncate">{event.title}</span>
                    <span className="shrink-0 text-sky-500 dark:text-sky-300">
                      {formatCompactEventTime(event)}
                    </span>
                  </a>
                ))
              )}
            </div>
          </div>
        )}

        {captureMode === "record" ? (
          <RecordingPanel
            isRecording={recorder.isRecording}
            seconds={recorder.seconds}
            error={recorder.error}
            onStart={() => void recorder.start()}
            onStop={recorder.stop}
            onDiscard={recorder.discard}
          />
        ) : null}

        {captureMode === "photo" ? (
          <div className="flex flex-col gap-3 border-y border-slate-100 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Add a photo memory
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Images are scanned so their details can be recalled by AI.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="action-secondary px-4"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Choose photo
            </button>
          </div>
        ) : null}

        {captureMode === "file" ? (
          <div className="flex flex-col gap-3 border-y border-slate-100 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                <FileUp className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Attach a document or audio file
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  PDF, image, Word, text or supported audio.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="action-secondary px-4"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              Choose file
            </button>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="content"
              className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              {captureMode === "write" ? "Diary content" : "Notes"}
            </label>
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
              {wordCount} words
            </span>
          </div>
          <textarea
            id="content"
            rows={captureMode === "write" ? 8 : 4}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
            placeholder={
              captureMode === "write"
                ? "Write your day in detail..."
                : "Add context or a note (optional)..."
            }
            value={draft.content}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, content: event.target.value }))
            }
          />

          {/* AI Copilot Toolbar */}
          {draft.content.trim().length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isCopilotLoading}
                onClick={() => handleCopilotAction("continue")}
                className="action-secondary min-h-10 px-3 text-xs disabled:opacity-50"
              >
                {activeCopilotAction === "continue"
                  ? "Thinking..."
                  : "Continue"}
              </button>
              <button
                type="button"
                disabled={isCopilotLoading}
                onClick={() => handleCopilotAction("fix_grammar")}
                className="action-secondary min-h-10 px-3 text-xs disabled:opacity-50"
              >
                {activeCopilotAction === "fix_grammar"
                  ? "Fixing..."
                  : "Fix Grammar"}
              </button>
              <button
                type="button"
                disabled={isCopilotLoading}
                onClick={() => handleCopilotAction("expand")}
                className="action-secondary min-h-10 px-3 text-xs disabled:opacity-50"
              >
                {activeCopilotAction === "expand" ? "Expanding..." : "Expand"}
              </button>
              <button
                type="button"
                disabled={isCopilotLoading}
                onClick={() => handleCopilotAction("summarize")}
                className="action-secondary min-h-10 px-3 text-xs disabled:opacity-50"
              >
                {activeCopilotAction === "summarize"
                  ? "Summarizing..."
                  : "Summarize"}
              </button>
            </div>
          )}
        </div>

        <input
          ref={photoInputRef}
          id="photo-attachments"
          type="file"
          accept="image/png,image/jpeg"
          capture="environment"
          className="hidden"
          onChange={attachmentQueue.handleSelection}
        />

        <input
          ref={fileInputRef}
          id="file-attachments"
          type="file"
          multiple
          accept=".txt,.pdf,.png,.jpg,.jpeg,.doc,.docx,.mp3,.m4a,.wav,.ogg,.webm,.aac,.flac,text/plain,application/pdf,image/png,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,audio/aac,audio/flac"
          className="hidden"
          onChange={attachmentQueue.handleSelection}
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <button
            type="submit"
            disabled={!canSubmit || state === "saving" || recorder.isRecording}
            className="action-primary px-5 disabled:cursor-not-allowed"
          >
            {state === "saving" ? "Saving..." : "Save Diary Entry"}
          </button>

          {attachmentQueue.items.length > 0 ? (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {attachmentQueue.items.length}{" "}
              {attachmentQueue.items.length === 1
                ? "attachment"
                : "attachments"}
            </span>
          ) : null}

          {state === "success" && (
            <span className="status-badge status-badge-success">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Saved successfully
            </span>
          )}
          {state === "error" && (
            <span className="status-badge status-badge-danger">
              {errorMessage || "Save failed."}
            </span>
          )}
          {!isAuthenticated && (
            <div className="flex items-center gap-3 rounded-lg bg-indigo-50/70 px-4 py-3 transition-all dark:bg-indigo-950/30">
              <LockKeyhole
                className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300"
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                  {showAuthPrompt
                    ? "Sign in to save your diary entry"
                    : "You're exploring as a guest"}
                </p>
                <p className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400">
                  {showAuthPrompt
                    ? "Your entry is ready — just sign in to keep it!"
                    : "Feel free to write — sign in when you're ready to save."}
                </p>
              </div>
              <a
                href="/login"
                className="action-primary shrink-0 min-h-10 px-3 text-xs"
              >
                Sign in
              </a>
            </div>
          )}
        </div>

        <AttachmentQueue
          items={attachmentQueue.items}
          onRemove={attachmentQueue.removeItem}
        />
      </form>

      <ReflectDeeper
        reflection={savedReflection}
        isLoading={isReflectionLoading}
        isSaving={state === "saving"}
        onFollowUp={startFollowUp}
      />

      {captureMode === "write" ? (
        <details className="mt-5 enterprise-card p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span>Quick writing templates</span>
          </summary>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {activeTemplates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="group flex w-[170px] shrink-0 cursor-pointer flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/20"
              >
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  {tpl.name}
                </span>
                <span className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                  {tpl.description}
                </span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
