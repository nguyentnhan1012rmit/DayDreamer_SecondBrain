import type { DiaryAttachment } from "@/lib/api/attachment-api";

export type AttachmentKind =
  | "audio"
  | "image"
  | "pdf"
  | "document"
  | "text"
  | "file";

export function isAttachmentObject(
  value: string | DiaryAttachment,
): value is DiaryAttachment {
  return typeof value === "object" && value !== null;
}

export function getAttachmentHref(attachment: string | DiaryAttachment) {
  return isAttachmentObject(attachment) ? attachment.signedUrl : attachment;
}

export function getAttachmentLabel(
  attachment: string | DiaryAttachment,
  index: number,
) {
  if (!isAttachmentObject(attachment)) return `File ${index + 1}`;
  return attachment.fileName || `File ${index + 1}`;
}

export function getAttachmentStatus(attachment: string | DiaryAttachment) {
  if (!isAttachmentObject(attachment)) return "linked";
  if (attachment.indexingStatus === "succeeded") return "indexed";
  if (attachment.indexingStatus === "processing") return "processing";
  if (attachment.indexingStatus === "retry") return "retry";
  if (
    attachment.indexingStatus === "dead_letter" ||
    attachment.indexingStatus === "failed"
  ) {
    return "failed";
  }
  return attachment.extractionStatus === "extracted" ? "queued" : "extracting";
}

export function isAudioAttachment(
  attachment: string | DiaryAttachment,
): attachment is DiaryAttachment {
  return (
    isAttachmentObject(attachment) && attachment.fileType.startsWith("audio/")
  );
}

export function getStatusTextClass(status: string) {
  if (status === "indexed") return "text-emerald-700 dark:text-emerald-300";
  if (status === "failed") return "text-rose-700 dark:text-rose-300";
  if (status === "processing") return "text-sky-700 dark:text-sky-300";
  return "text-amber-700 dark:text-amber-300";
}

export function getIndexStatusLabel(status: string) {
  if (status === "indexed") return "Indexed for AI";
  if (status === "processing") return "Indexing";
  if (status === "retry") return "Index retry";
  if (status === "failed") return "Index failed";
  if (status === "queued") return "Queued for index";
  if (status === "extracting") return "Extracting";
  return "Linked";
}

export function getMediaErrorMessage(error: MediaError | null) {
  if (!error) return "The browser could not load this audio.";
  if (error.code === MediaError.MEDIA_ERR_ABORTED) {
    return "Audio loading was interrupted.";
  }
  if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return "The audio download failed. Check the API and storage connection.";
  }
  if (error.code === MediaError.MEDIA_ERR_DECODE) {
    return "The browser could not decode this audio file.";
  }
  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "This audio source or format is not supported by the browser.";
  }
  return error.message || "The browser could not play this audio.";
}

export function formatFileSize(bytes?: number) {
  if (!bytes || bytes < 1) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatDuration(seconds?: number) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function getAttachmentKind(
  attachment: string | DiaryAttachment,
): AttachmentKind {
  if (!isAttachmentObject(attachment)) return "file";
  if (attachment.fileType.startsWith("audio/")) return "audio";
  if (attachment.fileType.startsWith("image/")) return "image";
  if (attachment.fileType === "application/pdf") return "pdf";
  if (
    attachment.fileType.includes("word") ||
    attachment.fileType.includes("document")
  ) {
    return "document";
  }
  if (attachment.fileType.startsWith("text/")) return "text";
  return "file";
}

export function getAttachmentTypeLabel(attachment: string | DiaryAttachment) {
  if (!isAttachmentObject(attachment)) return "File";
  const extension = attachment.fileName.split(".").pop();
  if (extension && extension !== attachment.fileName && extension.length <= 5) {
    return extension.toUpperCase();
  }
  const subtype = attachment.fileType.split("/").pop();
  return subtype
    ? subtype.replace("vnd.openxmlformats-officedocument.", "").toUpperCase()
    : "File";
}

export function getAskAboutAttachmentQuestion(attachment: DiaryAttachment) {
  const kind = getAttachmentKind(attachment);
  if (kind === "audio") return "What is this audio file about?";
  if (kind === "image") return "What information is in this image?";
  if (kind === "pdf") return "Summarize this PDF.";
  return "What is this file about?";
}

export function getAskAboutAttachmentHref(attachment: DiaryAttachment) {
  const params = new URLSearchParams({
    q: getAskAboutAttachmentQuestion(attachment),
    sourceType: "attachment",
    sourceId: attachment.id,
    sourceTitle: attachment.fileName,
    run: "1",
  });
  return `/search?${params.toString()}`;
}

export function getAttachmentIconClass(kind: AttachmentKind) {
  if (kind === "audio") {
    return "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300";
  }
  if (kind === "image") {
    return "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300";
  }
  if (kind === "pdf") {
    return "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300";
  }
  if (kind === "document") {
    return "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300";
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}
