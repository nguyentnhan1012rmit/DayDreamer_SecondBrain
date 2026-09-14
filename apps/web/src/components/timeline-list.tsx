"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Inbox, LoaderCircle, X } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";
import { EditDiaryModal } from "./edit-diary-modal";
import { TimelineEntryCard } from "@/features/timeline/components/timeline-entry-card";
import { buildRelatedMemoryMap } from "@/features/timeline/related-memory-score";
import {
  getEntryActivityDate,
  getTimelineGroup,
} from "@/features/timeline/timeline-utils";
import type {
  TimelineEntry,
  TimelineGroup,
  TimelineListProps,
} from "@/features/timeline/types";
import type { DiaryMood } from "@/lib/api/diary-api";

export function TimelineList({
  entries,
  onUpdate,
  onDelete,
  onLoadAttachmentAudio,
  onOpenAttachment,
  onProcessAttachment,
  hasMore = false,
  isLoadingMore = false,
  totalEntries,
  onLoadMore,
  isAdmin = false,
}: TimelineListProps) {
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimelineEntry | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const toastTimerId = useRef<number | null>(null);

  const relatedMemoriesByEntry = useMemo(
    () => buildRelatedMemoryMap(entries),
    [entries],
  );
  const groupedEntries = useMemo<TimelineGroup[]>(() => {
    const groups: TimelineGroup[] = [];
    const groupsByKey = new Map<string, TimelineGroup>();

    entries.forEach((entry, index) => {
      const groupMeta = getTimelineGroup(getEntryActivityDate(entry, isAdmin));
      let group = groupsByKey.get(groupMeta.key);
      if (!group) {
        group = { ...groupMeta, items: [] };
        groupsByKey.set(groupMeta.key, group);
        groups.push(group);
      }
      group.items.push({ entry, index });
    });
    return groups;
  }, [entries, isAdmin]);

  useEffect(
    () => () => {
      if (toastTimerId.current) window.clearTimeout(toastTimerId.current);
    },
    [],
  );

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    if (toastTimerId.current) window.clearTimeout(toastTimerId.current);
    toastTimerId.current = window.setTimeout(() => setToast(null), 3000);
  }

  async function handleSaveEdit(data: {
    title: string;
    content: string;
    mood: DiaryMood;
    tags: string[];
  }) {
    if (!editingEntry || !onUpdate) return;
    setIsSaving(true);
    try {
      await onUpdate(editingEntry.id, data);
      showToast("success", "Entry updated successfully");
      setEditingEntry(null);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Failed to update",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingEntry || !onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(deletingEntry.id);
      showToast("success", "Entry deleted successfully");
      setDeletingEntry(null);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Failed to delete",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function openRelatedMemory(id: string) {
    const target = document.getElementById(`entry-${id}`);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="relative">
      {toast ? (
        <div
          className={`animate-fade-in fixed top-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-sm ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
          role="status"
        >
          {toast.type === "success" ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <X className="h-4 w-4" aria-hidden="true" />
          )}
          {toast.message}
        </div>
      ) : null}

      <div className="space-y-8">
        {groupedEntries.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`timeline-group-${group.key}`}
          >
            <div className="mb-3 flex items-center gap-3 pl-10">
              <h2
                id={`timeline-group-${group.key}`}
                className="shrink-0 text-base font-bold text-slate-950 dark:text-slate-100"
              >
                {group.label}
              </h2>
              <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
                {group.items.length}{" "}
                {group.items.length === 1 ? "memory" : "memories"}
              </span>
              <span
                className="h-px flex-1 bg-slate-200 dark:bg-slate-800"
                aria-hidden="true"
              />
            </div>
            <div className="relative">
              {group.items.length > 1 ? (
                <div
                  className="absolute bottom-6 left-[14px] top-7 w-px bg-slate-200 dark:bg-slate-800"
                  aria-hidden="true"
                />
              ) : null}
              <ul className="space-y-4">
                {group.items.map(({ entry, index }) => (
                  <TimelineEntryCard
                    key={entry.id}
                    entry={entry}
                    entryNumber={
                      isAdmin
                        ? (totalEntries ?? entries.length) - index
                        : undefined
                    }
                    isAdmin={isAdmin}
                    relatedMemories={relatedMemoriesByEntry.get(entry.id) ?? []}
                    onEdit={onUpdate ? setEditingEntry : undefined}
                    onDelete={onDelete ? setDeletingEntry : undefined}
                    onOpenRelated={openRelatedMemory}
                    onLoadAttachmentAudio={onLoadAttachmentAudio}
                    onOpenAttachment={onOpenAttachment}
                    onProcessAttachment={onProcessAttachment}
                    onFeedback={showToast}
                  />
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      {!entries.length ? (
        <div className="py-12 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
            <Inbox className="h-7 w-7" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            No entries yet
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            Start by creating your first diary entry
          </p>
        </div>
      ) : null}

      {entries.length && (hasMore || isLoadingMore) ? (
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing {entries.length}
            {totalEntries ? ` of ${totalEntries}` : ""} entries
          </p>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore || !hasMore}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isLoadingMore ? (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {isLoadingMore ? "Loading" : "Load more"}
          </button>
        </div>
      ) : null}

      <EditDiaryModal
        isOpen={editingEntry !== null}
        initialTitle={editingEntry?.title ?? ""}
        initialContent={editingEntry?.content ?? ""}
        initialMood={editingEntry?.mood ?? "neutral"}
        initialTags={editingEntry?.tags ?? []}
        isLoading={isSaving}
        onSave={handleSaveEdit}
        onCancel={() => setEditingEntry(null)}
      />
      <ConfirmDialog
        isOpen={deletingEntry !== null}
        title="Delete Diary Entry"
        message={`Are you sure you want to delete "${deletingEntry?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingEntry(null)}
      />
    </div>
  );
}
