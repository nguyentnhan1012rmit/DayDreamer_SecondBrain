"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MessageCircleQuestion,
  Music2,
  Paperclip,
  RefreshCw,
  ScanText,
} from "lucide-react";
import type { DiaryAttachment } from "@/lib/api/attachment-api";
import {
  formatDuration,
  formatFileSize,
  getAskAboutAttachmentHref,
  getAttachmentIconClass,
  getAttachmentKind,
  getAttachmentLabel,
  getAttachmentStatus,
  getAttachmentTypeLabel,
  getIndexStatusLabel,
  getStatusTextClass,
  isAttachmentObject,
  isAudioAttachment,
  type AttachmentKind,
} from "../attachment-utils";
import { useAudioPlayback } from "../hooks/use-audio-playback";
import { AudioAttachment } from "./audio-attachment";

type AttachmentListProps = {
  attachments: Array<string | DiaryAttachment>;
  onLoadAttachmentAudio?: (attachmentId: string) => Promise<string | Blob>;
  onOpenAttachment?: (attachmentId: string) => Promise<string | Blob>;
  onProcessAttachment?: (attachmentId: string) => Promise<void>;
  onFeedback: (type: "success" | "error", message: string) => void;
};

function AttachmentTypeIcon({ kind }: { kind: AttachmentKind }) {
  const className = "h-5 w-5";
  if (kind === "audio") {
    return <Music2 className={className} aria-hidden="true" />;
  }
  if (kind === "image") {
    return <ImageIcon className={className} aria-hidden="true" />;
  }
  if (kind === "pdf" || kind === "document" || kind === "text") {
    return <FileText className={className} aria-hidden="true" />;
  }
  return <Paperclip className={className} aria-hidden="true" />;
}

function AskAboutAttachmentLink({
  attachment,
}: {
  attachment: DiaryAttachment;
}) {
  return (
    <Link
      href={getAskAboutAttachmentHref(attachment)}
      className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-100"
    >
      <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
      Ask about this file
    </Link>
  );
}

function ExtractionDetails({ attachment }: { attachment: DiaryAttachment }) {
  if (!attachment.extractedTextPreview) return null;

  return (
    <details className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-indigo-700 marker:hidden dark:text-indigo-300">
        <ScanText className="h-4 w-4" aria-hidden="true" />
        AI-read content
        {attachment.extractedCharacterCount ? (
          <span className="font-normal text-slate-400 dark:text-slate-500">
            {attachment.extractedCharacterCount.toLocaleString()} characters
          </span>
        ) : null}
      </summary>
      <p className="max-h-56 overflow-y-auto whitespace-pre-wrap border-l-2 border-indigo-200 px-3 text-xs leading-5 text-slate-600 dark:border-indigo-900 dark:text-slate-300">
        {attachment.extractedTextPreview}
      </p>
    </details>
  );
}

export function AttachmentList({
  attachments,
  onLoadAttachmentAudio,
  onOpenAttachment,
  onProcessAttachment,
  onFeedback,
}: AttachmentListProps) {
  const [processingIds, setProcessingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [openingIds, setOpeningIds] = useState<Set<string>>(() => new Set());
  const audio = useAudioPlayback(onLoadAttachmentAudio);

  async function openAttachment(attachment: DiaryAttachment) {
    if (!onOpenAttachment || openingIds.has(attachment.id)) return;
    setOpeningIds((current) => new Set(current).add(attachment.id));
    try {
      const content = await onOpenAttachment(attachment.id);
      const url =
        typeof content === "string" ? content : URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      if (typeof content !== "string") {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      onFeedback(
        "error",
        error instanceof Error ? error.message : "Could not open attachment",
      );
    } finally {
      setOpeningIds((current) => {
        const next = new Set(current);
        next.delete(attachment.id);
        return next;
      });
    }
  }

  async function processAttachment(attachment: DiaryAttachment) {
    if (!onProcessAttachment || processingIds.has(attachment.id)) return;
    setProcessingIds((current) => new Set(current).add(attachment.id));
    try {
      await onProcessAttachment(attachment.id);
      onFeedback(
        "success",
        attachment.fileType.startsWith("audio/")
          ? "Transcription queued"
          : "AI scan queued",
      );
    } catch (error) {
      onFeedback(
        "error",
        error instanceof Error
          ? error.message
          : "Could not retry attachment processing",
      );
    } finally {
      setProcessingIds((current) => {
        const next = new Set(current);
        next.delete(attachment.id);
        return next;
      });
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
      <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {attachments.length}{" "}
        {attachments.length === 1 ? "attachment" : "attachments"}
      </p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {attachments.map((attachment, index) => {
          const status = getAttachmentStatus(attachment);
          const label = getAttachmentLabel(attachment, index);
          const kind = getAttachmentKind(attachment);
          const data = isAttachmentObject(attachment) ? attachment : undefined;
          const indexStatusLabel =
            status === "failed"
              ? kind === "audio"
                ? "Transcription failed"
                : "AI scan failed"
              : getIndexStatusLabel(status);
          const sizeLabel = data
            ? formatFileSize(audio.blobSizes[data.id])
            : undefined;
          const durationLabel =
            data && kind === "audio" && audio.durations[data.id]
              ? formatDuration(audio.durations[data.id])
              : undefined;
          const isProcessing = data ? processingIds.has(data.id) : false;
          const canRetryExtraction = Boolean(
            data && status === "failed" && onProcessAttachment,
          );
          const key = data?.id ?? `${attachment}-${index}`;

          const header = (
            <>
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getAttachmentIconClass(kind)}`}
              >
                <AttachmentTypeIcon kind={kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {label}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{getAttachmentTypeLabel(attachment)}</span>
                  {sizeLabel ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{sizeLabel}</span>
                    </>
                  ) : null}
                  {durationLabel ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{durationLabel}</span>
                    </>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${getStatusTextClass(status)}`}
                    aria-label={`Memory indexing status: ${indexStatusLabel}`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-current"
                      aria-hidden="true"
                    />
                    {indexStatusLabel}
                  </span>
                </span>
              </span>
            </>
          );

          const retryButton =
            canRetryExtraction && data ? (
              <button
                type="button"
                onClick={() => void processAttachment(data)}
                disabled={isProcessing}
                className="mt-3 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-70 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {isProcessing
                  ? "Queueing"
                  : kind === "audio"
                    ? "Retry transcription"
                    : "Retry AI scan"}
              </button>
            ) : null;

          if (isAudioAttachment(attachment)) {
            return (
              <div
                key={key}
                id={`attachment-${attachment.id}`}
                className="w-full max-w-xl py-3"
              >
                <div className="mb-3 flex min-w-0 items-center gap-3">
                  {header}
                </div>
                <AudioAttachment
                  attachment={attachment}
                  label={label}
                  source={audio.urls[attachment.id]}
                  state={audio.states[attachment.id] ?? "idle"}
                  error={audio.errors[attachment.id]}
                  onError={(error) => audio.handleError(attachment, error)}
                  onLoadedMetadata={(duration) =>
                    audio.handleLoadedMetadata(attachment.id, duration)
                  }
                  onLoad={() => audio.load(attachment)}
                  onRetry={() => audio.retry(attachment)}
                />
                <ExtractionDetails attachment={attachment} />
                {retryButton}
                <div className="mt-2">
                  <AskAboutAttachmentLink attachment={attachment} />
                </div>
              </div>
            );
          }

          return (
            <div
              key={key}
              id={data ? `attachment-${data.id}` : undefined}
              className="w-full max-w-xl py-3"
            >
              <div className="flex items-center gap-3">
                {header}
                {data && onOpenAttachment ? (
                  <button
                    type="button"
                    onClick={() => void openAttachment(data)}
                    disabled={openingIds.has(data.id)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                    aria-label={`Open ${label}`}
                    title={`Open ${label}`}
                  >
                    <ExternalLink
                      className={`h-4 w-4 ${openingIds.has(data.id) ? "animate-pulse" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                ) : null}
              </div>
              {data ? <ExtractionDetails attachment={data} /> : null}
              {retryButton}
              {data ? (
                <div className="mt-2">
                  <AskAboutAttachmentLink attachment={data} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
