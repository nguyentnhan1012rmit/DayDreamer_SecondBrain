import type { MemoryDbClient } from "./types.ts";
import type { MemoryIntent } from "./answer-memory-types.ts";
import type { RetrievalFilters, MemorySearchHit } from "./retrieval.ts";
import {
  retrieveMemoryLexicalOnly,
  retrieveMemoryWithEmbedding,
} from "./retrieval.ts";
import { retrieveUnindexedDiaryFallbackHits } from "./answer-memory-unindexed.ts";
import { rerankMemoryHits } from "./answer-memory-rerank.ts";
import {
  buildLatestAvailableFilters,
  buildExpandedTemporalFilters,
  shouldFallbackToLatestAvailable,
  shouldExpandTemporalEvidenceSearch,
} from "./answer-memory-routing.ts";

export function dedupeMemoryHits(chunks: MemorySearchHit[]) {
  return [...new Map(chunks.map((chunk) => [chunk.id, chunk])).values()];
}

export type RetrievalPipelineResult = {
  chunks: MemorySearchHit[];
  retrieveMs: number;
  rerankMs: number;
  usedLatestFallback: boolean;
};

export async function retrieveUnindexedEvidence(
  dbClient: MemoryDbClient,
  userId: string,
  filters: RetrievalFilters,
) {
  return retrieveUnindexedDiaryFallbackHits(dbClient, userId, filters);
}

export async function retrieveLexicalFallbackEvidence({
  question,
  userId,
  dbClient,
  filters,
  unindexedChunks,
}: {
  question: string;
  userId: string;
  dbClient: MemoryDbClient;
  filters: RetrievalFilters;
  unindexedChunks: MemorySearchHit[];
}) {
  return (
    await retrieveLexicalFallbackEvidenceMeasured({
      question,
      userId,
      dbClient,
      filters,
      unindexedChunks,
    })
  ).chunks;
}

export async function retrieveLexicalFallbackEvidenceMeasured({
  question,
  userId,
  dbClient,
  filters,
  unindexedChunks,
}: {
  question: string;
  userId: string;
  dbClient: MemoryDbClient;
  filters: RetrievalFilters;
  unindexedChunks: MemorySearchHit[];
}): Promise<RetrievalPipelineResult> {
  let retrieveStart = performance.now();
  let lexicalChunks = await retrieveMemoryLexicalOnly(
    question,
    userId,
    dbClient,
    filters,
  );
  let retrieveMs = performance.now() - retrieveStart;
  let rerankStart = performance.now();
  let chunks = rerankMemoryHits(
    question,
    dedupeMemoryHits([...unindexedChunks, ...lexicalChunks]),
    filters,
  );
  let rerankMs = performance.now() - rerankStart;
  let usedLatestFallback = false;

  if (shouldFallbackToLatestAvailable(filters, chunks)) {
    usedLatestFallback = true;
    const latestFilters = buildLatestAvailableFilters(filters);
    retrieveStart = performance.now();
    const latestUnindexedChunks = await retrieveUnindexedEvidence(
      dbClient,
      userId,
      latestFilters,
    );
    lexicalChunks = await retrieveMemoryLexicalOnly(
      question,
      userId,
      dbClient,
      latestFilters,
    );
    retrieveMs += performance.now() - retrieveStart;
    rerankStart = performance.now();
    chunks = rerankMemoryHits(
      question,
      dedupeMemoryHits([...latestUnindexedChunks, ...lexicalChunks]),
      latestFilters,
    );
    rerankMs += performance.now() - rerankStart;
  }

  return {
    chunks,
    retrieveMs,
    rerankMs,
    usedLatestFallback,
  };
}

export async function retrieveEmbeddedEvidence({
  question,
  userId,
  dbClient,
  embedding,
  filters,
  intent,
  unindexedChunks,
}: {
  question: string;
  userId: string;
  dbClient: MemoryDbClient;
  embedding: number[];
  filters: RetrievalFilters;
  intent: MemoryIntent;
  unindexedChunks: MemorySearchHit[];
}) {
  return (
    await retrieveEmbeddedEvidenceMeasured({
      question,
      userId,
      dbClient,
      embedding,
      filters,
      intent,
      unindexedChunks,
    })
  ).chunks;
}

export async function retrieveEmbeddedEvidenceMeasured({
  question,
  userId,
  dbClient,
  embedding,
  filters,
  intent,
  unindexedChunks,
}: {
  question: string;
  userId: string;
  dbClient: MemoryDbClient;
  embedding: number[];
  filters: RetrievalFilters;
  intent: MemoryIntent;
  unindexedChunks: MemorySearchHit[];
}): Promise<RetrievalPipelineResult> {
  let retrieveMs = 0;
  let rerankMs = 0;
  let usedLatestFallback = false;
  let retrieveStart = performance.now();
  const initialIndexedChunks = await retrieveMemoryWithEmbedding(
    question,
    userId,
    dbClient,
    embedding,
    filters,
  );
  retrieveMs += performance.now() - retrieveStart;
  let rerankStart = performance.now();
  let indexedChunks = rerankMemoryHits(
    question,
    initialIndexedChunks,
    filters,
  );
  let chunks = rerankMemoryHits(question, dedupeMemoryHits([...unindexedChunks, ...indexedChunks]), filters);
  rerankMs += performance.now() - rerankStart;

  if (shouldExpandTemporalEvidenceSearch(question, intent, chunks, filters)) {
    const expandedFilters = buildExpandedTemporalFilters(filters);
    retrieveStart = performance.now();
    const expandedRawChunks = await retrieveMemoryWithEmbedding(
      question,
      userId,
      dbClient,
      embedding,
      expandedFilters,
    );
    retrieveMs += performance.now() - retrieveStart;
    rerankStart = performance.now();
    const expandedChunks = rerankMemoryHits(
      question,
      expandedRawChunks,
      expandedFilters,
    );
    indexedChunks = dedupeMemoryHits([...indexedChunks, ...expandedChunks]);
    chunks = rerankMemoryHits(question, dedupeMemoryHits([...unindexedChunks, ...indexedChunks]), filters);
    rerankMs += performance.now() - rerankStart;
  }

  if (shouldFallbackToLatestAvailable(filters, chunks)) {
    usedLatestFallback = true;
    const latestFilters = buildLatestAvailableFilters(filters);
    retrieveStart = performance.now();
    const latestUnindexedChunks = await retrieveUnindexedEvidence(
      dbClient,
      userId,
      latestFilters,
    );
    const latestRawChunks = await retrieveMemoryWithEmbedding(
      question,
      userId,
      dbClient,
      embedding,
      latestFilters,
    );
    retrieveMs += performance.now() - retrieveStart;
    rerankStart = performance.now();
    chunks = rerankMemoryHits(
      question,
      dedupeMemoryHits([...latestUnindexedChunks, ...latestRawChunks]),
      latestFilters,
    );
    rerankMs += performance.now() - rerankStart;
  }

  return { chunks, retrieveMs, rerankMs, usedLatestFallback };
}
