import type { useGoogleDriveIntegration } from "./use-google-drive";
import type { SelectiveImportControl, WorkspaceRow } from "../google-connections/google-workspace-types";

export function createDriveWorkspaceSource(drive: ReturnType<typeof useGoogleDriveIntegration>, selectiveImport: SelectiveImportControl, onImport: () => void): WorkspaceRow {
  return {
    source: "drive",
    label: "Drive",
    description: "Docs and files that Second Brain can quote when answering questions.",
    syncedTo: "google_drive_files, indexing_outbox, memory_chunks",
    aiUsage: "Answers can cite imported docs, plans, and file summaries.",
    valueLabel: `${drive.status?.fileCount ?? 0} files`,
    valueCount: drive.status?.fileCount ?? 0,
    noun: "files",
    lastSyncedAt: drive.status?.lastSyncedAt ?? null,
    scopes: drive.status?.scopes ?? [],
    requestedScopes: drive.status?.requestedScopes ?? ["https://www.googleapis.com/auth/drive.readonly"],
    workspaceScopes: drive.status?.workspaceScopes ?? [],
    lastError: drive.status?.lastError ?? null,
    lastErrorAt: drive.status?.lastErrorAt ?? null,
    connected: Boolean(drive.status?.connected),
    isLoading: drive.isLoading,
    isSyncing: drive.isSyncing,
    feedback: drive.feedback,
    examples: ["What does the demo plan require?", "Which document explains MVP scope?"],
    onImport,
    selectiveImport,
  };
}
