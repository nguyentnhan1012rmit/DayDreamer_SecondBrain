import { indexMemoryFromCalendar } from "@second-brain/ai";
import { deleteMemoryChunksForSource } from "@second-brain/db";
import { prisma } from "../../../lib/prisma";
import type { SourceProcessor } from "../indexing-job";
import { persistChunksWithEntities } from "../memory-persistence";

export const processCalendar: SourceProcessor = async (job, context) => {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: job.source_id, user_id: job.user_id },
  });
  if (!event) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "calendar",
        sourceId: job.source_id,
      });
    });
    return;
  }
  const result = await indexMemoryFromCalendar({
    userId: job.user_id,
    events: [
      {
        eventId: event.id,
        externalId: event.external_id,
        title: event.title,
        description: event.description,
        startTime: event.start_time,
        endTime: event.end_time,
        htmlLink: event.html_link,
      },
    ],
    insertChunks: (chunks) =>
      prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await persistChunksWithEntities(tx, chunks, {
          userId: job.user_id,
          sourceType: "calendar",
          sourceId: event.id,
        });
      }),
  });
  if (result.errors.length) {
    throw new Error(result.errors.map((item) => item.error).join("; "));
  }
};
