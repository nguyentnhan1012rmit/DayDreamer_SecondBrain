import { indexMemoryFromSummary } from "@second-brain/ai";
import { deleteMemoryChunksForSource } from "@second-brain/db";
import { prisma } from "../../../lib/prisma";
import type { SourceProcessor } from "../indexing-job";
import { persistChunksWithEntities } from "../memory-persistence";

export const processSummary: SourceProcessor = async (job, context) => {
  const summary = await prisma.summary.findFirst({
    where: { id: job.source_id, user_id: job.user_id, dirty: false },
  });
  if (!summary) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "summary",
        sourceId: job.source_id,
      });
    });
    return;
  }
  const result = await indexMemoryFromSummary({
    userId: job.user_id,
    summaryId: summary.id,
    summaryType: summary.summary_type,
    content: summary.content,
    periodStart: summary.period_start,
    periodEnd: summary.period_end,
    insertChunks: (chunks) =>
      prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await persistChunksWithEntities(tx, chunks, {
          userId: job.user_id,
          sourceType: "summary",
          sourceId: summary.id,
        });
      }),
  });
  if (!result.chunkCount) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "summary",
        sourceId: summary.id,
      });
    });
  }
};
