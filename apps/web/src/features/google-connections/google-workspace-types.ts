export type WorkspaceSource = "calendar" | "contact" | "drive" | "gmail";
export type SourceTone = "ready" | "working" | "attention" | "idle";

export type SourceFeedback = { type: "success" | "error"; text: string };

export type SelectableImportCandidate = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  date: string | null;
  alreadyImported: boolean;
  href?: string | null;
  iconUrl?: string | null;
  thumbnailUrl?: string | null;
  previewKind?: "drive" | "gmail";
};

export type SelectiveImportControl = {
  query: string;
  queryPlaceholder: string;
  emptyLabel: string;
  browseLabel: string;
  importLabel: string;
  candidates: SelectableImportCandidate[];
  selectedIds: string[];
  isListing: boolean;
  onQueryChange: (value: string) => void;
  onBrowse: () => void;
  onToggle: (id: string) => void;
  onImportSelected: () => void;
};

export type WorkspaceRow = {
  source: WorkspaceSource;
  label: string;
  description: string;
  syncedTo: string;
  aiUsage: string;
  valueLabel: string;
  valueCount: number;
  noun: string;
  lastSyncedAt: string | null;
  scopes: string[];
  requestedScopes: string[];
  workspaceScopes: string[];
  lastError: string | null;
  lastErrorAt: string | null;
  connected: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  feedback?: SourceFeedback | null;
  examples: string[];
  onImport: () => void;
  selectiveImport?: SelectiveImportControl;
};

export type IndexingInfo = { label: string; detail?: string; tone: SourceTone; active: boolean; failed: boolean };
export type SourcePresentation = { statusLabel: string; statusDetail: string; tone: SourceTone; buttonLabel: string; buttonKind: "connect" | "import" };
