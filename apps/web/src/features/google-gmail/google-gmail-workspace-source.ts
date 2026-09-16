import type { useGoogleGmailIntegration } from "./use-google-gmail";
import type { SelectiveImportControl, WorkspaceRow } from "../google-connections/google-workspace-types";

export function createGmailWorkspaceSource(gmail: ReturnType<typeof useGoogleGmailIntegration>, selectiveImport: SelectiveImportControl, onImport: () => void): WorkspaceRow {
  return {
    source: "gmail",
    label: "Gmail",
    description: "Recent emails that can become cited memory for project decisions and feedback.",
    syncedTo: "gmail_messages, indexing_outbox, memory_chunks",
    aiUsage: "Answers can cite email feedback, decisions, and project conversations.",
    valueLabel: `${gmail.status?.messageCount ?? 0} messages`,
    valueCount: gmail.status?.messageCount ?? 0,
    noun: "messages",
    lastSyncedAt: gmail.status?.lastSyncedAt ?? null,
    scopes: gmail.status?.scopes ?? [],
    requestedScopes: gmail.status?.requestedScopes ?? ["https://www.googleapis.com/auth/gmail.readonly"],
    workspaceScopes: gmail.status?.workspaceScopes ?? [],
    lastError: gmail.status?.lastError ?? null,
    lastErrorAt: gmail.status?.lastErrorAt ?? null,
    connected: Boolean(gmail.status?.connected),
    isLoading: gmail.isLoading,
    isSyncing: gmail.isSyncing,
    feedback: gmail.feedback,
    examples: ["What feedback did Linh send?", "Which emails mention the demo?"],
    onImport,
    selectiveImport,
  };
}
