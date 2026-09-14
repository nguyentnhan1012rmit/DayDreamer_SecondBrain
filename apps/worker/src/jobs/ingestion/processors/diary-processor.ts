import { indexMemoryFromDiary } from "@second-brain/ai";
import { deleteMemoryChunksForSource } from "@second-brain/db";
import { prisma } from "../../../lib/prisma";
import type { SourceProcessor } from "../indexing-job";
import { persistChunksWithEntities } from "../memory-persistence";

export const processDiary: SourceProcessor = async (job, context) => {
  const diary = await prisma.diaryEntry.findFirst({
    where: { id: job.source_id, user_id: job.user_id },
  });
  if (!diary) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "diary",
        sourceId: job.source_id,
      });
    });
    return;
  }

  const title =
    typeof job.payload?.sourceTitle === "string"
      ? job.payload.sourceTitle
      : diary.raw_text.split("\n")[0]?.trim() || "Diary entry";
  const tags = diary.tags ?? [];
  const metadata = [
    diary.mood ? `Mood: ${diary.mood}` : "",
    tags.length ? `Tags: ${tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const result = await indexMemoryFromDiary({
    userId: job.user_id,
    diaryId: diary.id,
    rawText: metadata ? `${diary.raw_text}\n\n${metadata}` : diary.raw_text,
    entryDate: diary.entry_date,
    sourceTitle: title,
    insertChunks: (chunks) =>
      prisma.$transaction(async (tx) => {
        await context.assertLeaseCurrent(tx);
        await persistChunksWithEntities(tx, chunks, {
          userId: job.user_id,
          sourceType: "diary",
          sourceId: diary.id,
        });
      }),
  });
  if (!result.chunkCount) {
    await prisma.$transaction(async (tx) => {
      await context.assertLeaseCurrent(tx);
      await deleteMemoryChunksForSource(tx as any, {
        userId: job.user_id,
        sourceType: "diary",
        sourceId: diary.id,
      });
    });
  }
};
