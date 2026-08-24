"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { DiaryMood } from "@/lib/api-client";
import { MOOD_OPTIONS } from "@/lib/mood-meta";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

const subscribeToClientMount = () => () => undefined;

function normalizeTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

type EditDiaryModalProps = {
  isOpen: boolean;
  initialTitle: string;
  initialContent: string;
  initialMood?: DiaryMood | null;
  initialTags?: string[];
  isLoading?: boolean;
  onSave: (data: { title: string; content: string; mood: DiaryMood; tags: string[] }) => void;
  onCancel: () => void;
};

type EditDiaryModalContentProps = {
  initialTitle: string;
  initialContent: string;
  initialMood: DiaryMood;
  initialTags: string[];
  isLoading: boolean;
  onSave: EditDiaryModalProps["onSave"];
  onCancel: EditDiaryModalProps["onCancel"];
  dialogRef: RefObject<HTMLDivElement | null>;
  titleInputRef: RefObject<HTMLInputElement | null>;
  titleId: string;
};

export function EditDiaryModal({
  isOpen,
  initialTitle,
  initialContent,
  initialMood = "neutral",
  initialTags = [],
  isLoading = false,
  onSave,
  onCancel,
}: EditDiaryModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!isOpen || !mounted) return;

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      if (titleInputRef.current && !titleInputRef.current.disabled) {
        titleInputRef.current.focus();
        titleInputRef.current.select();
      } else {
        dialogRef.current?.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;

      const previouslyFocusedElement = previouslyFocusedElementRef.current;
      previouslyFocusedElementRef.current = null;
      if (previouslyFocusedElement?.isConnected) {
        window.requestAnimationFrame(() => previouslyFocusedElement.focus());
      }
    };
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen || !mounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isLoading) return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hasAttribute("hidden"),
      );

      if (!focusableElements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (
        event.shiftKey &&
        (activeElement === firstElement || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement || !dialog.contains(activeElement))
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, mounted, onCancel]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <EditDiaryModalContent
      key={JSON.stringify([
        initialTitle,
        initialContent,
        initialMood,
        initialTags,
      ])}
      initialTitle={initialTitle}
      initialContent={initialContent}
      initialMood={initialMood ?? "neutral"}
      initialTags={initialTags}
      isLoading={isLoading}
      onSave={onSave}
      onCancel={onCancel}
      dialogRef={dialogRef}
      titleInputRef={titleInputRef}
      titleId={titleId}
    />,
    document.body,
  );
}

function EditDiaryModalContent({
  initialTitle,
  initialContent,
  initialMood,
  initialTags,
  isLoading,
  onSave,
  onCancel,
  dialogRef,
  titleInputRef,
  titleId,
}: EditDiaryModalContentProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [mood, setMood] = useState<DiaryMood>(initialMood);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");

  const canSave = title.trim().length > 0 && content.trim().length > 0;

  function addTag(value = tagInput) {
    const normalized = normalizeTag(value);
    if (!normalized || tags.includes(normalized) || tags.length >= 12) {
      setTagInput("");
      return;
    }

    setTags((current) => [...current, normalized]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((current) => current.filter((item) => item !== tag));
  }

  function handleTagInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }

    if (event.key === "Backspace" && !tagInput && tags.length) {
      setTags((current) => current.slice(0, -1));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => {
          if (!isLoading) onCancel();
        }}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={isLoading}
        tabIndex={-1}
        className="animate-modal-in relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3
            id={titleId}
            className="text-lg font-bold text-slate-900 dark:text-slate-100"
          >
            Edit Diary Entry
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-slate-300 dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-slate-800"
            aria-label="Close edit diary dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-title" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Title
            </label>
            <input
              ref={titleInputRef}
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
            />
          </div>
          <div>
            <label htmlFor="edit-content" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Content
            </label>
            <textarea
              id="edit-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              disabled={isLoading}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
            />
          </div>
          <div>
            <p className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Mood
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MOOD_OPTIONS.map((option) => {
                const isSelected = mood === option.value;
                const MoodIcon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isLoading}
                    onClick={() => setMood(option.value)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition disabled:opacity-50 ${
                      isSelected
                        ? `${option.className} ring-2 ring-indigo-300 dark:ring-indigo-600`
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-indigo-900/20"
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span className="flex items-center gap-2">
                      <MoodIcon className="h-4 w-4" aria-hidden="true" />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs font-normal opacity-75">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="edit-tags" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Tags
            </label>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-slate-600 dark:bg-slate-700 dark:focus-within:border-indigo-500 dark:focus-within:ring-indigo-900/40">
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800"
                  >
                    #{tag}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => removeTag(tag)}
                      className="rounded-full text-indigo-400 transition hover:text-indigo-700 disabled:opacity-50 dark:hover:text-indigo-100"
                      aria-label={`Remove ${tag} tag`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <input
                  id="edit-tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  onBlur={() => addTag()}
                  disabled={isLoading}
                  maxLength={32}
                  placeholder={tags.length ? "Add another tag" : "project, health, meeting"}
                  className="min-w-32 flex-1 bg-transparent px-1 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="action-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || isLoading}
            onClick={() => onSave({ title: title.trim(), content: content.trim(), mood, tags })}
            className="action-primary disabled:cursor-not-allowed"
          >
            {isLoading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
