import { authFetch } from "./http-client";

export type DiaryCalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  htmlLink?: string | null;
};

export type CalendarConnectionStatus = {
  connected: boolean;
  eventCount: number;
  lastSyncedAt: string | null;
};

export type CalendarEventRecord = DiaryCalendarEvent & {
  description: string | null;
  htmlLink: string | null;
};

export type CalendarSyncResponse = {
  message: string;
  syncedCount: number;
  queuedIndexingJobs?: number;
  linkedDiaryCount?: number;
  linkedEventCount?: number;
  memoryIndexingStatus?: "queued" | "succeeded" | "failed";
};

async function calendarError(response: Response, fallback: string) {
  const error = await response.json().catch(() => ({ message: fallback }));
  throw new Error(error.message || `HTTP ${response.status}`);
}

export async function getCalendarStatus(
  accessToken: string | null,
): Promise<CalendarConnectionStatus> {
  const response = await authFetch(
    "/api/calendar/status",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok)
    await calendarError(response, "Failed to fetch calendar status");
  return response.json();
}

export async function getCalendarEvents(
  accessToken: string | null,
): Promise<CalendarEventRecord[]> {
  const response = await authFetch(
    "/api/calendar/events",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok)
    await calendarError(response, "Failed to fetch calendar events");

  const data = (await response.json()) as {
    events?: Array<{
      id: string;
      title: string;
      description?: string | null;
      start_time: string;
      end_time: string;
      html_link?: string | null;
    }>;
  };

  return (data.events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    startTime: event.start_time,
    endTime: event.end_time,
    htmlLink: event.html_link ?? null,
  }));
}

export async function getGoogleCalendarConnectUrl(
  accessToken: string | null,
): Promise<string> {
  const response = await authFetch(
    "/api/calendar/connect",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok) {
    await calendarError(response, "Failed to start Google Calendar connection");
  }

  const data = (await response.json()) as { url?: string };
  if (!data.url) {
    throw new Error("Backend did not return a Google Calendar connect URL");
  }
  return data.url;
}

export async function syncGoogleCalendar(
  accessToken: string | null,
  limit?: number,
): Promise<CalendarSyncResponse> {
  const query = limit
    ? `?${new URLSearchParams({ limit: String(limit) })}`
    : "";
  const response = await authFetch(
    `/api/calendar/sync${query}`,
    { method: "POST" },
    accessToken,
  );
  if (!response.ok)
    await calendarError(response, "Failed to sync Google Calendar");
  return response.json();
}
