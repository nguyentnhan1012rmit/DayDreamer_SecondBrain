import { authFetch } from "./http-client";

export type AdminDiagnostics = {
  status: "ok" | "degraded";
  checkedAt: string;
  database: { ok: boolean; detail?: string };
  environment: {
    databaseConfigured: boolean;
    supabaseConfigured: boolean;
    tuturuuuConfigured: boolean;
    googleOAuthConfigured: boolean;
    redisConfigured?: boolean;
    redisReachable?: boolean;
    temporalConfigured?: boolean;
    sentryConfigured?: boolean;
    openTelemetryConfigured?: boolean;
  };
  enterpriseControls?: {
    requestId: { enabled: boolean; header: string };
    securityHeaders: { enabled: boolean; headers: string[] };
    rateLimit: {
      enabled: boolean;
      storage: string;
      redisConfigured?: boolean;
      redisConnected?: boolean;
      redisLastError?: string | null;
      profiles: Record<string, { max: number; windowMs: number }>;
    };
    searchCache?: {
      enabled: boolean;
      storage: string;
      ttlSeconds: number;
      redisConfigured: boolean;
      redisConnected: boolean;
    };
    auditLogging: { enabled: boolean; sink: string; piiSafe: boolean };
    observability: {
      sentryConfigured: boolean;
      openTelemetryConfigured: boolean;
      redisConfigured: boolean;
      redisReachable?: boolean;
      redisError?: string | null;
      temporalConfigured: boolean;
    };
  };
  worker?: {
    available: boolean;
    ok: boolean;
    status: "healthy" | "missing" | "stale" | "stopping" | "unavailable";
    id?: string;
    detail: string;
    lastHeartbeatAt: string | null;
    heartbeatAgeMs: number | null;
    staleAfterMs: number;
  };
  schema: {
    tables: Record<string, { ok: boolean; required: boolean; detail?: string }>;
    indexes: Record<
      string,
      { ok: boolean; required: boolean; detail?: string }
    >;
  };
  indexingOutbox: {
    available: boolean;
    counts: Record<string, number>;
    pendingJobCount?: number;
    dueJobCount?: number;
    staleProcessingCount?: number;
    failedJobCount?: number;
    deadLetterJobCount?: number;
    oldestPendingAgeMs?: number | null;
    detail?: string;
  };
  embeddingIndex?: EmbeddingIndexStatus & {
    available: boolean;
    detail?: string;
  };
  warnings: string[];
};

export type EmbeddingIndexStatus = {
  healthy: boolean;
  embeddingModel: string;
  totalChunks: number;
  embeddedChunks: number;
  currentEmbeddingModelChunks: number;
  staleEmbeddingModelChunks: number;
  missingEmbeddingChunks: number;
  latestChunkUpdatedAt: string | null;
};

export type IndexingJobStatus = {
  id: string;
  jobType: string;
  sourceType: string;
  sourceId: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  lastErrorAt: string | null;
  runAfter: string;
  nextRunAfter: string;
  ageMs: number;
  processingAgeMs: number | null;
  lockedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IndexingStatus = {
  available: boolean;
  reason?: string;
  counts: Record<string, number>;
  staleProcessingCount: number;
  embeddingIndex?: EmbeddingIndexStatus;
  recent: IndexingJobStatus[];
};

export type RequeueIndexingJobResponse = {
  requeued: boolean;
  reason?: string;
  job?: IndexingJobStatus;
};

export type RequeueDeadLetterResponse = {
  requeued: number;
  status?: string;
  reason?: string;
};

export type DemoReadiness = {
  ready: boolean;
  counts: {
    diaryEntries: number;
    memoryChunks: number;
    summaries: number;
    calendarEvents: number;
    linkedDiaries: number;
    attachments: number;
    extractedAttachments: number;
    pendingOutbox: number;
    failedOutbox: number;
    staleProcessingOutbox?: number;
    currentEmbeddingModelChunks?: number;
    staleEmbeddingModelChunks?: number;
    missingEmbeddingChunks?: number;
  };
  outbox: { available: boolean; counts: Record<string, number> };
  embeddingIndex?: EmbeddingIndexStatus;
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    required: boolean;
    detail: string;
  }>;
  nextActions: string[];
};

async function adminError(response: Response, fallback: string) {
  const error = await response.json().catch(() => ({ message: fallback }));
  throw new Error(error.message || `HTTP ${response.status}`);
}

export async function getAdminDiagnostics(
  accessToken: string | null,
): Promise<AdminDiagnostics> {
  const response = await authFetch(
    "/api/admin/diagnostics",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok)
    await adminError(response, "Failed to fetch admin diagnostics");
  return response.json();
}

export async function getIndexingStatus(
  accessToken: string | null,
): Promise<IndexingStatus> {
  const response = await authFetch(
    "/api/indexing/status",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok)
    await adminError(response, "Failed to fetch indexing status");
  return response.json();
}

export async function getDemoReadiness(
  accessToken: string | null,
): Promise<DemoReadiness> {
  const response = await authFetch(
    "/api/indexing/demo-readiness",
    { method: "GET" },
    accessToken,
  );
  if (!response.ok)
    await adminError(response, "Failed to fetch demo readiness");
  return response.json();
}

export async function requeueIndexingJob(
  accessToken: string | null,
  jobId: string,
): Promise<RequeueIndexingJobResponse> {
  const response = await authFetch(
    `/api/indexing/jobs/${jobId}/requeue`,
    { method: "POST" },
    accessToken,
  );
  if (!response.ok)
    await adminError(response, "Failed to requeue indexing job");
  return response.json();
}

export async function requeueDeadLetterIndexingJobs(
  accessToken: string | null,
): Promise<RequeueDeadLetterResponse> {
  const response = await authFetch(
    "/api/indexing/jobs/requeue-dead-letter",
    { method: "POST" },
    accessToken,
  );
  if (!response.ok) {
    await adminError(response, "Failed to requeue dead-letter indexing jobs");
  }
  return response.json();
}
