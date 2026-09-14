import { extractEntityMentionsFromMetadata } from "@second-brain/ai";
import {
  deleteEntityMentionsForSource,
  insertEntityMentions,
  insertMemoryChunks,
  pruneMemoryChunksForSource,
  resolveMemoryChunkIds,
} from "@second-brain/db";
import type { PersistedMemoryChunkPayload } from "@second-brain/ai";

export async function persistChunksWithEntities(
  tx: any,
  chunks: PersistedMemoryChunkPayload[],
  source: { userId: string; sourceType: string; sourceId: string },
) {
  await insertMemoryChunks(tx, chunks);
  await pruneMemoryChunksForSource(tx, {
    ...source,
    keepChunkCount: chunks.length,
  });
  await deleteEntityMentionsForSource(tx, source);
  if (!chunks.length) return;

  const chunkIdMap = await resolveMemoryChunkIds(tx, source);
  const seen = new Set<string>();
  const mentions = chunks.flatMap((chunk) => {
    const chunkId = chunkIdMap.get(chunk.chunkIndex);
    if (!chunkId) return [];
    return extractEntityMentionsFromMetadata(chunk.metadata)
      .filter((mention) => {
        const key = `${chunkId}:${mention.entityType}:${mention.entityValue}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((mention) => ({ chunkId, ...mention }));
  });
  await insertEntityMentions(tx, mentions);
}
