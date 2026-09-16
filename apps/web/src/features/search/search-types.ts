import type { SearchHistoryEntry } from "@/lib/api/search-api";

export type SearchCitation = {
  marker: string;
  chunkId: string;
  sourceType: string;
  sourceId: string;
  sourceTitle?: string;
  occurredAt: string;
  chunkType: string;
  quote: string;
  similarity: number;
  claim?: string;
};

export type AnswerMode =
  | "cache"
  | "fast_path"
  | "tuturuuu"
  | "extractive_fallback"
  | "no_memory";

export type AnswerStrategy = "auto" | "fast" | "deep";

export type QueryAnalytics = {
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
  };
  timing: {
    embedMs: number;
    retrieveMs: number;
    generateMs: number;
    totalMs: number;
  };
  chunksRetrieved: number;
  status: "success" | "no_memory" | "error";
  answerMode?: AnswerMode;
  cacheVersion?: string;
};

export type MemoryIndexDiagnostics = {
  embeddingModel: string;
  totalChunks: number;
  embeddedChunks: number;
  currentEmbeddingModelChunks: number;
  staleEmbeddingModelChunks: number;
  latestOccurredAt?: string | null;
  issue:
    | "none"
    | "empty_index"
    | "missing_embeddings"
    | "stale_embeddings"
    | "mixed_embeddings";
};

export type MemoryDebugTrace = {
  question: string;
  inferredFilters: Record<string, unknown>;
  appliedFilters: Record<string, unknown>;
  status: "success" | "no_memory" | "error";
  reason: string;
  routingTrace?: {
    intent: string;
    requestedStrategy: AnswerStrategy;
    selectedPath:
      | "unindexed_fast_path"
      | "embedding_error_fallback"
      | "created_date_mismatch"
      | "indexed_fast_path"
      | "deep_generation"
      | "deep_validation_fallback"
      | "deep_model_error_fallback"
      | "no_memory";
    reason: string;
    autoFastEligible: boolean;
    fastPathEligible: boolean;
    usedUnindexedDiary: boolean;
    translationRan: boolean;
  };
  chunksRetrieved: number;
  diagnostics?: MemoryIndexDiagnostics;
  topChunks: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    sourceTitle?: string;
    chunkType: string;
    occurredAt: string;
    retrievalMode: string;
    similarity: number;
    vectorSimilarity: number;
    lexicalScore: number;
    entityScore?: number;
    distance: number | null;
    quote: string;
  }>;
};

export type SearchResponse = {
  answer: string;
  confidence: "high" | "medium" | "low";
  sources: SearchCitation[];
  noMemory?: boolean;
  suggestions?: string[];
  analytics?: QueryAnalytics | null;
  modelError?: {
    status?: number;
    kind:
      | "auth"
      | "quota"
      | "billing"
      | "model_config"
      | "service_unavailable"
      | "validation"
      | "transient"
      | "unknown";
    message: string;
  } | null;
  debugTrace?: MemoryDebugTrace | null;
  cached?: boolean;
  cachedAt?: string;
  answerMode?: AnswerMode;
  cacheStorage?: "redis" | "database";
};

export type ResponseLanguage = "en" | "vi";

export type SearchScope = {
  sourceType: string;
  sourceId: string;
  sourceTitle?: string;
};

export type { SearchHistoryEntry };
