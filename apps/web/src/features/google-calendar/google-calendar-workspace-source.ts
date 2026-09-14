import type { useGoogleCalendarIntegration } from "./use-google-calendar";
import type { WorkspaceRow } from "../google-connections/google-workspace-types";

export function createCalendarWorkspaceSource(calendar: ReturnType<typeof useGoogleCalendarIntegration>): WorkspaceRow {
  return {
    source: "calendar",
    label: "Calendar",
    description: "Meetings and events that explain what happened around diary entries.",
    syncedTo: "calendar_events, diary links, memory_chunks",
    aiUsage: "Answers can cite meetings, deadlines, and events linked to diary days.",
    valueLabel: `${calendar.status?.eventCount ?? 0} events`,
    valueCount: calendar.status?.eventCount ?? 0,
    noun: "events",
    lastSyncedAt: calendar.status?.lastSyncedAt ?? null,
    scopes: calendar.status?.scopes ?? [],
    requestedScopes: calendar.status?.requestedScopes ?? ["https://www.googleapis.com/auth/calendar.readonly"],
    workspaceScopes: calendar.status?.workspaceScopes ?? [],
    lastError: calendar.status?.lastError ?? null,
    lastErrorAt: calendar.status?.lastErrorAt ?? null,
    connected: Boolean(calendar.status?.connected),
    isLoading: calendar.isLoading,
    isSyncing: calendar.isSyncing,
    feedback: calendar.feedback,
    examples: ["What meetings were linked to my diary?", "What was on my calendar this week?"],
    onImport: () => void calendar.syncCalendar(),
  };
}
