import type { DiaryMood } from "@/lib/api/diary-api";

export type DiaryDraft = {
  title: string;
  content: string;
  entryDate: string;
  mood: DiaryMood;
  tags: string[];
};

export type SaveState = "idle" | "saving" | "success" | "error";
export type CaptureMode = "write" | "record" | "photo" | "file";
export type AttachmentStatus =
  | "queued"
  | "uploading"
  | "extracting"
  | "indexed"
  | "pending"
  | "error";

export type AttachmentQueueItem = {
  id: string;
  file: File;
  status: AttachmentStatus;
  message: string;
  attachmentId?: string;
  signedUrl?: string;
  memoryChunkCount?: number;
};

export type SavedReflection = {
  entryId: string;
  entryTitle: string;
  mood: DiaryMood;
  question: string;
};
