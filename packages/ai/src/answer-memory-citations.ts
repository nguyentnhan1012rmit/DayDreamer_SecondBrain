import type { MemoryCitation } from "./answer-utils.ts";
import { isClaimSupportedByQuote } from "./answer-memory-validation.ts";

export type ModelCitation = { marker: string; claim: string };

export function validateModelCitations(
  modelCitations: ModelCitation[],
  sources: MemoryCitation[],
) {
  const sourceByMarker = new Map(sources.map((source) => [source.marker, source]));
  const valid = modelCitations.filter((citation) => sourceByMarker.has(citation.marker));
  const supported = valid.filter((citation) => {
    const source = sourceByMarker.get(citation.marker);
    return source ? isClaimSupportedByQuote(citation.claim, source.quote) : false;
  });
  return { sourceByMarker, valid, supported };
}

export function attachCitationClaims(
  sources: MemoryCitation[],
  citations: ModelCitation[],
) {
  const claims = new Map(citations.map((citation) => [citation.marker, citation.claim]));
  return sources
    .filter((source) => claims.has(source.marker))
    .map((source) => ({ ...source, claim: claims.get(source.marker) }));
}

export function mergeRecoveredCitations<T extends { chunkId: string; similarity: number }>(
  citations: T[],
  recoveredCitations: T[],
): T[] {
  const byChunkId = new Map(citations.map((citation) => [citation.chunkId, citation]));
  recoveredCitations.forEach((citation) => {
    if (!byChunkId.has(citation.chunkId)) byChunkId.set(citation.chunkId, citation);
  });
  return [...byChunkId.values()].sort((a, b) => b.similarity - a.similarity).slice(0, 4);
}
