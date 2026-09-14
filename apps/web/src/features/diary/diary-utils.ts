import { isAudioAttachmentMimeType } from "@second-brain/shared";
import type { AttachmentUploadResponse } from "@/lib/api/attachment-api";
import type { DiaryMood } from "@/lib/api/diary-api";
import type { AttachmentStatus, DiaryDraft } from "@/features/diary/types";

export function isAudioFile(file: Pick<File, "type">) {
  return isAudioAttachmentMimeType(file.type);
}

export function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createInitialDiaryDraft(): DiaryDraft {
  return {
    title: "",
    content: "",
    entryDate: getLocalDateInputValue(),
    mood: "neutral",
    tags: [],
  };
}

export function getReflectionFallback(mood: DiaryMood) {
  if (mood === "great") {
    return "What helped create this energy, and how could you carry it forward?";
  }
  if (mood === "good") {
    return "What made this moment feel steady or meaningful to you?";
  }
  if (mood === "bad") {
    return "What felt heaviest here, and what support would have helped?";
  }
  return "What detail from this moment might matter more than it seems right now?";
}

export function normalizeReflectionQuestion(value: string, fallback: string) {
  const firstLine = value
    .trim()
    .split(/\n+/)[0]
    ?.replace(/^[\s>*#-]+/, "")
    .replace(/^[\"']|[\"']$/g, "")
    .trim();

  if (!firstLine) return fallback;
  const shortened = firstLine.slice(0, 240).trim();
  return /[?？]$/.test(shortened) ? shortened : `${shortened}?`;
}

export function getAttachmentMessage(response: AttachmentUploadResponse) {
  if (response.processingError) {
    return `${response.processingError}. Worker will retry later.`;
  }

  if (response.extractionStatus === "failed") {
    return response.attachment.fileType.startsWith("audio/")
      ? "Audio transcription failed; retry from Timeline"
      : "AI could not read this file; retry the scan from Timeline";
  }

  if (response.memoryIndexed) {
    return `Indexed ${response.memoryChunkCount} memory chunks`;
  }
  if (response.memoryIndexingStatus === "dead_letter") {
    return "Indexing failed after retries. Requeue from Settings or upload again.";
  }
  if (response.memoryIndexingStatus === "retry") {
    return "Worker hit a temporary error; retry is scheduled automatically.";
  }
  if (
    response.memoryIndexingStatus === "queued" ||
    response.memoryIndexingStatus === "pending"
  ) {
    if (response.attachment.fileType.startsWith("audio/")) {
      return response.extractionStatus === "extracted"
        ? "Transcript ready; queued for memory indexing"
        : "Saved; queued for transcription and memory indexing";
    }
    return response.extractionStatus === "extracted"
      ? "Text extracted; queued for memory indexing"
      : "Saved; queued for text extraction and memory indexing";
  }
  if (response.memoryIndexingStatus === "processing") {
    if (
      response.attachment.fileType.startsWith("audio/") &&
      response.extractionStatus !== "extracted"
    ) {
      return "Audio transcription in progress";
    }
    return response.extractionStatus === "extracted"
      ? "Text extracted; indexing in progress"
      : "Text extraction in progress";
  }
  if (response.memoryIndexingStatus === "failed") {
    return "Attachment indexing failed; try processing it again";
  }
  if (response.extractionStatus === "pending") {
    return "Saved; extraction pending";
  }
  return "Text extracted; waiting for memory indexing";
}

export function getAttachmentStatus(
  response: AttachmentUploadResponse,
): AttachmentStatus {
  if (
    response.processingError ||
    response.extractionStatus === "failed" ||
    response.memoryIndexingStatus === "failed" ||
    response.memoryIndexingStatus === "dead_letter"
  ) {
    return "error";
  }
  if (response.memoryIndexed || response.memoryIndexingStatus === "succeeded") {
    return "indexed";
  }
  if (response.memoryIndexingStatus === "processing") return "extracting";
  return "pending";
}

export function getAttachmentStatusClass(status: AttachmentStatus) {
  if (status === "indexed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800";
  }
  if (status === "error") {
    return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800";
  }
  if (status === "pending") {
    return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800";
  }
  if (status === "uploading" || status === "extracting") {
    return "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800";
  }
  return "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800";
}
