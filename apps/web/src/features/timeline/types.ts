import type { DiaryAttachment } from "@/lib/api/attachment-api";
import type { DiaryCalendarEvent } from "@/lib/api/calendar-api";
import type { DiaryMood, UpdateDiaryPayload } from "@/lib/api/diary-api";

export type TimelineEntry = {
  id: string;
  title: string;
  content: string;
  mood?: DiaryMood | null;
  tags?: string[];
  attachments?: Array<string | DiaryAttachment>;
  calendarEvents?: DiaryCalendarEvent[];
  entryDate?: Date | string;
  createdAt: Date | string;
  updatedAt?: Date | string;
};

export type TimelineListProps = {
  entries: TimelineEntry[];
  onUpdate?: (id: string, payload: UpdateDiaryPayload) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onLoadAttachmentAudio?: (attachmentId: string) => Promise<string | Blob>;
  onOpenAttachment?: (attachmentId: string) => Promise<string | Blob>;
  onProcessAttachment?: (attachmentId: string) => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalEntries?: number;
  onLoadMore?: () => void;
  isAdmin?: boolean;
};

export type TimelineGroup = {
  key: string;
  label: string;
  items: Array<{ entry: TimelineEntry; index: number }>;
};

export type RelatedMemory = {
  entry: TimelineEntry;
  reason: string;
  score: number;
};
