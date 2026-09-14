import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import PrismaPackage from "@prisma/client";
import { Pool } from "pg";

const { PrismaClient } = PrismaPackage;
const DEFAULT_SIZES = [365, 1_000, 10_000];
const PEOPLE = ["Linh Nguyen", "Dung Tran", "Lam Pham", "Quan Le", "Tam Vo"];
const PROJECTS = ["Second Brain", "Capstone Demo", "Memory Search", "Timeline UX"];
const HABITS = ["daily reflection", "deep work", "weekly review", "exercise"];
const VECTOR_POOL = Array.from({ length: 128 }, (_, index) => buildVector(index));

async function main() {
  const connectionString = requiredPerformanceDatabaseUrl();
  const sizes = parseSizes(process.argv.slice(2));
  const pool = new Pool({ connectionString, max: 4 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as any;

  try {
    for (const size of sizes) {
      const startedAt = performance.now();
      const email = `performance-${size}@second-brain.local`;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) await prisma.user.delete({ where: { id: existing.id } });
      const user = await prisma.user.create({
        data: {
          supabaseId: randomUUID(),
          email,
          display_name: `Performance Dataset ${size}`,
        },
      });

      const records = Array.from({ length: size }, (_, index) =>
        buildRecord(size, user.id, index),
      );
      for (const batch of batches(records, 500)) {
        await prisma.diaryEntry.createMany({
          data: batch.map((record) => record.diary),
        });
      }

      const attachments = records.flatMap((record) =>
        record.attachment ? [record.attachment] : [],
      );
      const events = records.flatMap((record) =>
        record.event ? [record.event] : [],
      );
      for (const batch of batches(attachments, 500)) {
        await prisma.attachment.createMany({ data: batch });
      }
      for (const batch of batches(events, 500)) {
        await prisma.calendarEvent.createMany({ data: batch });
      }
      for (const batch of batches(
        records.flatMap((record) =>
          record.event
            ? [{ eventId: record.event.id, diaryId: record.diary.id }]
            : [],
        ),
        500,
      )) {
        await insertCalendarLinks(prisma, batch);
      }
      for (const batch of batches(records, 100)) {
        await insertMemoryChunks(prisma, batch);
      }
      for (const batch of batches(
        records.flatMap((record) => record.entities),
        1_000,
      )) {
        await prisma.entityMention.createMany({ data: batch });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { memory_revision: { increment: 1 } },
      });
      await prisma.$executeRawUnsafe(
        "ANALYZE diary_entries, attachments, calendar_events, memory_chunks, entity_mentions",
      );

      console.log(
        JSON.stringify({
          size,
          userId: user.id,
          diaryEntries: records.length,
          attachments: attachments.length,
          calendarEvents: events.length,
          memoryChunks: records.length,
          entityMentions: records.length * 3,
          elapsedMs: Math.round(performance.now() - startedAt),
        }),
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => undefined);
  }
}

function buildRecord(size: number, userId: string, index: number) {
  const sequence = String(index + 1).padStart(5, "0");
  const prefix = `perf-${size}-${sequence}`;
  const person = PEOPLE[index % PEOPLE.length]!;
  const project = PROJECTS[index % PROJECTS.length]!;
  const habit = HABITS[index % HABITS.length]!;
  const occurredAt = new Date(
    Date.UTC(2025 + Math.floor(index / 365), index % 12, (index % 28) + 1, index % 24, index % 60),
  );
  const diaryId = `${prefix}-diary`;
  const attachmentId = `${prefix}-attachment`;
  const eventId = `${prefix}-calendar`;
  const chunkId = `${prefix}-chunk`;
  const hasAttachment = index % 5 === 0;
  const hasEvent = index % 3 === 0;
  const sourceType = hasAttachment ? "attachment" : hasEvent ? "calendar" : "diary";
  const sourceId = hasAttachment ? attachmentId : hasEvent ? eventId : diaryId;
  const text = `${person} worked on ${project}. The concrete decision was to protect the ${habit} block and review retrieval latency before Friday. Record ${index + 1}.`;

  return {
    diary: {
      id: diaryId,
      user_id: userId,
      raw_text: `Performance note ${index + 1}\n\n${text}`,
      status: "published",
      mood: ["great", "good", "neutral", "bad"][index % 4],
      tags: [slug(project), slug(habit), slug(person)],
      entry_date: occurredAt,
      created_at: occurredAt,
      updated_at: occurredAt,
    },
    attachment: hasAttachment
      ? {
          id: attachmentId,
          diary_entry_id: diaryId,
          storage_path: `performance/${size}/${attachmentId}.txt`,
          file_type: "text/plain",
          extracted_text: `Attachment evidence: ${text}`,
          created_at: occurredAt,
        }
      : null,
    event: hasEvent
      ? {
          id: eventId,
          user_id: userId,
          external_id: `performance-event-${size}-${sequence}`,
          title: `${project} review with ${person}`,
          description: `Review ${habit}, latency, and follow-up actions.`,
          start_time: occurredAt,
          end_time: new Date(occurredAt.getTime() + 45 * 60_000),
          html_link: "https://calendar.google.com/",
          created_at: occurredAt,
          updated_at: occurredAt,
        }
      : null,
    chunk: {
      id: chunkId,
      userId,
      sourceType,
      sourceId,
      chunkType: index % 4 === 0 ? "decision" : "general_note",
      text,
      evidence: `${person} worked on ${project} and protected ${habit}.`,
      occurredAt,
      metadata: JSON.stringify({
        sourceTitle: `Performance note ${index + 1}`,
        people: [person],
        projects: [project],
        habits: [habit],
        embeddingModel: "performance-deterministic-768",
        embeddingDimension: 768,
        embeddingStatus: "embedded",
      }),
      vector: VECTOR_POOL[index % VECTOR_POOL.length]!,
    },
    entities: [
      entity(chunkId, "person", person),
      entity(chunkId, "project", project),
      entity(chunkId, "habit", habit),
    ],
  };
}

async function insertMemoryChunks(prisma: any, records: ReturnType<typeof buildRecord>[]) {
  const values: unknown[] = [];
  const rows = records.map((record) => {
    const offset = values.length;
    values.push(
      record.chunk.id,
      record.chunk.userId,
      record.chunk.sourceType,
      record.chunk.sourceId,
      record.chunk.chunkType,
      record.chunk.text,
      record.chunk.evidence,
      record.chunk.metadata,
      record.chunk.occurredAt,
      record.chunk.vector,
    );
    return `($${offset + 1}::text, $${offset + 2}::text, $${offset + 3}, $${offset + 4}::text, 0, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb, $${offset + 9}, $${offset + 10}::vector)`;
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO memory_chunks
      (id, user_id, source_type, source_id, chunk_index, chunk_type, text, evidence, metadata, occurred_at, embedding)
     VALUES ${rows.join(",")}`,
    ...values,
  );
}

async function insertCalendarLinks(
  prisma: any,
  links: Array<{ eventId: string; diaryId: string }>,
) {
  const values: string[] = [];
  const rows = links.map((link) => {
    const offset = values.length;
    values.push(link.eventId, link.diaryId);
    return `($${offset + 1}::text, $${offset + 2}::text)`;
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_CalendarEventToDiaryEntry" ("A", "B") VALUES ${rows.join(",")} ON CONFLICT DO NOTHING`,
    ...values,
  );
}

function entity(chunkId: string, entityType: string, entityValue: string) {
  return {
    chunk_id: chunkId,
    entity_type: entityType,
    entity_value: entityValue,
    entity_value_normalized: slug(entityValue).replaceAll("-", " "),
  };
}

function buildVector(seed: number) {
  const values = Array.from({ length: 768 }, (_, index) =>
    Math.sin((seed + 1) * (index + 3) * 0.017) +
    Math.cos((seed + 7) * (index + 1) * 0.011),
  );
  const norm = Math.hypot(...values) || 1;
  return `[${values.map((value) => (value / norm).toFixed(7)).join(",")}]`;
}

function parseSizes(args: string[]) {
  const value = args.find((arg) => arg.startsWith("--sizes="))?.split("=")[1];
  const sizes = (value ? value.split(",") : DEFAULT_SIZES)
    .map(Number)
    .filter((size) => Number.isInteger(size) && size > 0 && size <= 100_000);
  if (!sizes.length) throw new Error("No valid dataset sizes were provided.");
  return Array.from(new Set(sizes));
}

function requiredPerformanceDatabaseUrl() {
  const value = process.env.PERF_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "PERF_DATABASE_URL is required. Point it at a dedicated benchmark database.",
    );
  }
  const host = new URL(value).hostname;
  const local = ["localhost", "127.0.0.1", "postgres"].includes(host);
  if (!local && process.env.PERF_ALLOW_REMOTE !== "true") {
    throw new Error(
      "Remote performance seeding is blocked. Set PERF_ALLOW_REMOTE=true only for a dedicated benchmark database.",
    );
  }
  return value;
}

function batches<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
