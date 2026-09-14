import { indexMemoryFromGmail } from "@second-brain/ai";
import { deleteMemoryChunksForSource } from "@second-brain/db";
import { prisma } from "../../../lib/prisma";
import type { SourceProcessor } from "../indexing-job";
import { persistChunksWithEntities } from "../memory-persistence";

export const processGmail: SourceProcessor = async (job, context) => {
  const message = await prisma.gmailMessage.findFirst({
    where: { id: job.source_id, user_id: job.user_id },
  });
  if (!message) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "gmail",
        sourceId: job.source_id,
      });
    });
    return;
  }
  const result = await indexMemoryFromGmail({
    userId: job.user_id,
    message: {
      messageId: message.id,
      externalId: message.external_id,
      threadId: message.thread_id,
      sender: message.sender,
      subject: message.subject,
      snippet: message.snippet,
      body: message.body,
      receivedAt: message.received_at,
    },
    insertChunks: (chunks) =>
      prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await persistChunksWithEntities(tx, chunks, {
          userId: job.user_id,
          sourceType: "gmail",
          sourceId: message.id,
        });
      }),
  });
  if (!result.chunkCount) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "gmail",
        sourceId: message.id,
      });
    });
  }
};
