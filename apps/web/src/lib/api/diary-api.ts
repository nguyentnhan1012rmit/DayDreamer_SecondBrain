import type { DiaryAttachment } from "./attachment-api";
import type { DiaryCalendarEvent } from "./calendar-api";
import { authFetch } from "./http-client";

export type DiaryMood = "great" | "good" | "neutral" | "bad";

export type DiaryEntry = {
  id: string;
  title: string;
  content: string;
  mood?: DiaryMood | null;
  tags?: string[];
  attachments?: Array<string | DiaryAttachment>;
  calendarEvents?: DiaryCalendarEvent[];
  entryDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type DiaryPage = {
  entries: DiaryEntry[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type DiaryStatistics = {
  period: "weekly" | "yearly";
  periodStart: string;
  periodEnd: string;
  timeZone: string;
  totalEntries: number;
  activeDays: number;
  totalWords: number;
  averageWordsPerActiveDay: number;
  moodCounts: Record<DiaryMood, number>;
  topTags: Array<{ tag: string; count: number }>;
  days: Array<{ date: string; entryCount: number; wordCount: number }>;
  availableYears: number[];
};

export type CreateDiaryPayload = {
  title: string;
  content: string;
  mood?: DiaryMood | null;
  tags?: string[];
  attachments?: string[];
  entryDate?: string;
};

export type UpdateDiaryPayload = Partial<CreateDiaryPayload>;

export const DEFAULT_DIARY_PAGE_SIZE = 25;

async function diaryError(response: Response, fallback: string) {
  const error = await response.json().catch(() => ({ message: fallback }));
  throw new Error(error.message || `HTTP ${response.status}`);
}

export async function createDiaryEntry(
  payload: CreateDiaryPayload,
  accessToken: string | null,
): Promise<DiaryEntry> {
  const response = await authFetch(
    "/api/diary",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  if (!response.ok) await diaryError(response, "Failed to create diary entry");
  return response.json();
}

export async function getDiaryEntries(
  accessToken: string | null,
  options: {
    limit?: number;
    cursor?: string | null;
    startDate?: Date | string;
    endDate?: Date | string;
  } = {},
): Promise<DiaryPage> {
  const query = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_DIARY_PAGE_SIZE),
  });
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.startDate) {
    query.set(
      "startDate",
      options.startDate instanceof Date
        ? options.startDate.toISOString()
        : options.startDate,
    );
  }
  if (options.endDate) {
    query.set(
      "endDate",
      options.endDate instanceof Date
        ? options.endDate.toISOString()
        : options.endDate,
    );
  }
  const response = await authFetch(
    `/api/diary?${query}`,
    { method: "GET", cache: "no-store" },
    accessToken,
  );
  if (!response.ok) await diaryError(response, "Failed to fetch diary entries");
  return response.json();
}

export async function getDiaryStatistics(
  accessToken: string | null,
  options: {
    period: "weekly" | "yearly";
    anchor?: Date | string;
    timeZone?: string;
  },
): Promise<DiaryStatistics> {
  const query = new URLSearchParams({ period: options.period });
  if (options.anchor) {
    query.set(
      "anchor",
      options.anchor instanceof Date
        ? options.anchor.toISOString()
        : options.anchor,
    );
  }
  if (options.timeZone) query.set("timeZone", options.timeZone);

  const response = await authFetch(
    `/api/diary/statistics?${query}`,
    { method: "GET", cache: "no-store" },
    accessToken,
  );
  if (!response.ok) {
    await diaryError(response, "Failed to fetch diary statistics");
  }
  return response.json();
}

export async function getDiaryEntry(
  id: string,
  accessToken: string | null,
): Promise<DiaryEntry> {
  const response = await authFetch(
    `/api/diary/${id}`,
    { method: "GET" },
    accessToken,
  );
  if (!response.ok) await diaryError(response, "Failed to fetch diary entry");
  return response.json();
}

export async function updateDiaryEntry(
  id: string,
  payload: UpdateDiaryPayload,
  accessToken: string | null,
): Promise<DiaryEntry> {
  const response = await authFetch(
    `/api/diary/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    accessToken,
  );
  if (!response.ok) await diaryError(response, "Failed to update diary entry");
  return response.json();
}

export async function deleteDiaryEntry(
  id: string,
  accessToken: string | null,
): Promise<void> {
  const response = await authFetch(
    `/api/diary/${id}`,
    { method: "DELETE" },
    accessToken,
  );
  if (!response.ok) await diaryError(response, "Failed to delete diary entry");
}

export async function copilotDiaryText(
  payload: { text: string; action: string },
  accessToken: string | null,
): Promise<{ result: string }> {
  const response = await authFetch(
    "/api/diary/copilot",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  if (!response.ok) await diaryError(response, "Copilot request failed");
  return response.json();
}
