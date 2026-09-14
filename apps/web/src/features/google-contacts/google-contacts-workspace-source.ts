import type { useGoogleContactsIntegration } from "./use-google-contacts";
import type { WorkspaceRow } from "../google-connections/google-workspace-types";

export function createContactsWorkspaceSource(contacts: ReturnType<typeof useGoogleContactsIntegration>): WorkspaceRow {
  return {
    source: "contact",
    label: "Contacts",
    description: "People and organizations that help AI understand names in your memories.",
    syncedTo: "google_contacts, entity context, memory_chunks",
    aiUsage: "Answers can resolve who people are and cite relevant contact context.",
    valueLabel: `${contacts.status?.contactCount ?? 0} contacts`,
    valueCount: contacts.status?.contactCount ?? 0,
    noun: "contacts",
    lastSyncedAt: contacts.status?.lastSyncedAt ?? null,
    scopes: contacts.status?.scopes ?? [],
    requestedScopes: contacts.status?.requestedScopes ?? ["https://www.googleapis.com/auth/contacts.readonly"],
    workspaceScopes: contacts.status?.workspaceScopes ?? [],
    lastError: contacts.status?.lastError ?? null,
    lastErrorAt: contacts.status?.lastErrorAt ?? null,
    connected: Boolean(contacts.status?.connected),
    isLoading: contacts.isLoading,
    isSyncing: contacts.isSyncing,
    feedback: contacts.feedback,
    examples: ["Who is Linh in my workspace?", "Which contacts are related to the project?"],
    onImport: () => void contacts.syncGoogleContacts(50),
  };
}
