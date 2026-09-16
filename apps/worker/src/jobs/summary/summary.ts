import {
  getSummaryPeriod,
  resolveSummaryTimeZone,
  SummaryGenerationEngine,
  type SummaryEngineStore,
  type SummaryPeriodType,
} from "@second-brain/ai";
import {
  bumpUserMemoryRevision,
  deleteMemoryChunksForSource,
  expireUserSearchHistory,
  getUserMemoryRevision,
  markDependentSummariesDirty,
  withPostgresAdvisoryLock,
} from "@second-brain/db";
import * as cron from "node-cron";
import { prisma } from "../../lib/prisma";

function createSummaryStore(): SummaryEngineStore {
  return {
    findExisting: ({ userId, type, period }) =>
      prisma.summary.findFirst({
        where: {
          user_id: userId,
          summary_type: type,
          dirty: false,
          period_start: period.start,
          period_end: period.end,
        },
      }),
    findLowerSummaries: ({ userId, type, period }) =>
      prisma.summary.findMany({
        where: {
          user_id: userId,
          summary_type: type,
          period_start: { gte: period.start },
          period_end: { lte: period.end },
        },
        orderBy: { period_start: "asc" },
      }),
    findActivity: async ({ userId, period, limit, coveredRanges }) => {
      const dateWhere = (field: string) => ({
        AND: [
          { [field]: { gte: period.start, lte: period.end } },
          ...coveredRanges.map((range) => ({
            OR: [
              { [field]: { lt: range.start } },
              { [field]: { gt: range.end } },
            ],
          })),
        ],
      });
      const [diaries, events, attachments, gmail, drive, contacts] =
        await Promise.all([
        prisma.diaryEntry.findMany({
          where: {
            user_id: userId,
            ...dateWhere("entry_date"),
          },
          orderBy: { entry_date: "asc" },
          take: limit,
        }),
        prisma.calendarEvent.findMany({
          where: {
            user_id: userId,
            ...dateWhere("start_time"),
          },
          orderBy: { start_time: "asc" },
          take: limit,
        }),
        prisma.attachment.findMany({
          where: {
            extracted_text: { not: null },
            diary_entry: {
              user_id: userId,
              ...dateWhere("entry_date"),
            },
          },
          include: { diary_entry: { select: { entry_date: true } } },
          orderBy: { created_at: "asc" },
          take: limit,
        }),
        prisma.gmailMessage.findMany({
          where: { user_id: userId, ...dateWhere("received_at") },
          orderBy: { received_at: "asc" },
          take: limit,
        }),
        prisma.googleDriveFile.findMany({
          where: {
            user_id: userId,
            extracted_text: { not: null },
            ...dateWhere("modified_time"),
          },
          orderBy: { modified_time: "asc" },
          take: limit,
        }),
        prisma.googleContact.findMany({
          where: { user_id: userId, ...dateWhere("updated_at") },
          orderBy: { updated_at: "asc" },
          take: limit,
        }),
      ]);
      return {
        diaries,
        events,
        attachments: attachments.map((attachment) => ({
          occurred_at: attachment.diary_entry.entry_date,
          extracted_text: attachment.extracted_text!,
          file_type: attachment.file_type,
          source_title: attachment.storage_path.split("/").pop(),
        })),
        gmail: gmail
          .filter((message) => message.received_at)
          .map((message) => ({
            received_at: message.received_at!,
            sender: message.sender,
            subject: message.subject,
            body: message.body,
          })),
        drive: drive
          .filter((file) => file.modified_time)
          .map((file) => ({
            occurred_at: file.modified_time!,
            name: file.name,
            extracted_text: file.extracted_text!,
          })),
        contacts: contacts.map((contact) => ({
          occurred_at: contact.updated_at,
          display_name: contact.display_name,
          email_addresses: contact.email_addresses,
          organizations: contact.organizations,
        })),
      };
    },
    getSourceVersion: (userId) =>
      getUserMemoryRevision(prisma as any, userId),
    save: ({ userId, type, period, content, sourceVersion }) =>
      prisma.$transaction(async (tx) => {
        const currentVersion = await getUserMemoryRevision(tx as any, userId);
        let dirty = currentVersion !== sourceVersion;
        if (!dirty) {
          const persistedVersion = await bumpUserMemoryRevision(
            tx as any,
            userId,
          );
          dirty = persistedVersion !== sourceVersion + 1n;
          await expireUserSearchHistory(tx as any, userId);
        }
        const summary = await tx.summary.upsert({
          where: {
            user_id_summary_type_period_start_period_end: {
              user_id: userId,
              summary_type: type,
              period_start: period.start,
              period_end: period.end,
            },
          },
          update: { content, source_version: sourceVersion, dirty },
          create: {
            user_id: userId,
            summary_type: type,
            period_start: period.start,
            period_end: period.end,
            content,
            source_version: sourceVersion,
            dirty,
          },
        });
        await markDependentSummariesDirty(tx as any, {
          userId,
          summaryType: type,
          periodStart: period.start,
          periodEnd: period.end,
        });
        await deleteMemoryChunksForSource(tx as any, {
          userId,
          sourceType: "summary",
          sourceId: summary.id,
        });
        if (!dirty) {
          await enqueueSummaryIndexingJob(userId, summary.id, tx);
        }
        return summary;
      }),
    ensureIndexed: async (summary, userId) => {
      await enqueueSummaryIndexingJob(userId, summary.id);
    },
  };
}

function createSummaryEngine() {
  return new SummaryGenerationEngine(createSummaryStore(), {
    contextItemLimit: Number(process.env.SUMMARY_CONTEXT_ITEM_LIMIT ?? 80),
    contextMaxChars: Number(process.env.SUMMARY_CONTEXT_MAX_CHARS ?? 24_000),
    timeZone: resolveSummaryTimeZone(),
    withLock: (key, callback) => withPostgresAdvisoryLock(key, callback),
  });
}

async function generateSummaryForUser(
  userId: string,
  type: SummaryPeriodType,
  anchorDate = new Date(),
  force = false,
) {
  const result = await createSummaryEngine().generate({
    userId,
    type,
    anchorDate,
    force,
  });

  if (result.status === "existing") {
    console.log(
      `[Worker - ${type} Summary] Existing summary found for ${userId}; skipping duplicate.`,
    );
  } else if (result.status === "empty") {
    console.log(
      `[Worker - ${type} Summary] No source activity found for ${userId}; skipping.`,
    );
  } else if (result.status === "locked") {
    console.log(
      `[Worker - ${type} Summary] Another instance owns ${userId}; skipping.`,
    );
  } else if (result.status === "stale") {
    console.log(
      `[Worker - ${type} Summary] Source changed during generation for ${userId}; leaving summary dirty for catch-up.`,
    );
  }
  return result.summary ?? null;
}

async function enqueueSummaryIndexingJob(
  userId: string,
  summaryId: string,
  tx: any = prisma,
) {
  return tx.indexingOutbox.upsert({
    where: {
      job_type_source_type_source_id: {
        job_type: "index_memory",
        source_type: "summary",
        source_id: summaryId,
      },
    },
    update: {
      user_id: userId,
      status: "pending",
      retry_count: 0,
      error: null,
      payload: {},
      generation: { increment: 1 },
      run_after: new Date(),
      locked_at: null,
      locked_by: null,
      processed_at: null,
    },
    create: {
      user_id: userId,
      job_type: "index_memory",
      source_type: "summary",
      source_id: summaryId,
      status: "pending",
      payload: {},
    },
  });
}

async function runForAllUsers(
  type: SummaryPeriodType,
  anchorDate = new Date(),
) {
  const lock = await withPostgresAdvisoryLock(
    `summary-cron:${type}`,
    async () => {
      const users = await prisma.user.findMany({ select: { id: true } });
      for (const user of users) {
        try {
          await generateSummaryForUser(user.id, type, anchorDate);
        } catch (error) {
          console.error(
            `[Worker - ${type} Summary] Failed for User ${user.id}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    },
  );
  if (!lock.acquired) {
    console.log(
      `[Worker - ${type} Summary] Another worker owns the cron lock; skipping.`,
    );
  }
}

function previousClosedPeriodAnchor(type: SummaryPeriodType, now = new Date()) {
  const currentPeriod = getSummaryPeriod(type, now, resolveSummaryTimeZone());
  return new Date(currentPeriod.start.getTime() - 1);
}

export async function runSummaryCatchUp(now = new Date()) {
  const lock = await withPostgresAdvisoryLock(
    "summary-catch-up",
    async () => {
      const dirty = await prisma.summary.findMany({
        where: { dirty: true, period_end: { lt: now } },
        select: { user_id: true, summary_type: true, period_start: true },
        orderBy: { period_end: "asc" },
        take: 200,
      });
      const rank: Record<string, number> = {
        daily: 1,
        weekly: 2,
        monthly: 3,
        yearly: 4,
      };
      dirty.sort(
        (left, right) =>
          (rank[left.summary_type] ?? 99) - (rank[right.summary_type] ?? 99),
      );
      for (const summary of dirty) {
        if (!(summary.summary_type in rank)) continue;
        try {
          await generateSummaryForUser(
            summary.user_id,
            summary.summary_type as SummaryPeriodType,
            summary.period_start,
          );
        } catch (error) {
          console.error(
            `[Worker - Summary Catch-up] Failed ${summary.summary_type} summary for ${summary.user_id}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      const users = await prisma.user.findMany({ select: { id: true } });
      for (const type of ["daily", "weekly", "monthly", "yearly"] as const) {
        const anchor = previousClosedPeriodAnchor(type, now);
        const period = getSummaryPeriod(type, anchor, resolveSummaryTimeZone());
        const readySummaries = await prisma.summary.findMany({
          where: {
            summary_type: type,
            period_start: period.start,
            period_end: period.end,
            dirty: false,
          },
          select: { user_id: true },
        });
        const readyUserIds = new Set(
          readySummaries.map((summary) => summary.user_id),
        );
        for (const user of users) {
          if (readyUserIds.has(user.id)) continue;
          try {
            await generateSummaryForUser(user.id, type, anchor);
          } catch (error) {
            console.error(
              `[Worker - Summary Catch-up] Failed previous ${type} period for ${user.id}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }
      }
      return { dirtyProcessed: dirty.length, usersChecked: users.length };
    },
  );
  return lock.acquired ? lock.value : null;
}

export class SummaryCatchUpJob {
  static startCron() {
    void runSummaryCatchUp().catch((error) => {
      console.error("[Worker - Summary Catch-up] Initial run failed:", error);
    });
    cron.schedule("*/15 * * * *", () => {
      void runSummaryCatchUp().catch((error) => {
        console.error("[Worker - Summary Catch-up] Failed:", error);
      });
    });
    console.log("Background Worker for Summary Catch-up started.");
  }
}

export class SummaryPipelineJob {
  static generateDailySummaryForUser(
    userId: string,
    anchorDate = new Date(),
    force = false,
  ) {
    return generateSummaryForUser(userId, "daily", anchorDate, force);
  }

  static startCron() {
    const timeZone = resolveSummaryTimeZone();
    cron.schedule("5 0 * * *", () => void runForAllUsers(
      "daily",
      previousClosedPeriodAnchor("daily"),
    ), {
      timezone: timeZone,
    });
    console.log("Background Worker for Daily Summary Pipeline started.");
  }
}

export class WeeklySummaryPipelineJob {
  static generateWeeklySummaryForUser(
    userId: string,
    anchorDate = new Date(),
    force = false,
  ) {
    return generateSummaryForUser(userId, "weekly", anchorDate, force);
  }

  static startCron() {
    const timeZone = resolveSummaryTimeZone();
    cron.schedule("10 0 * * 1", () => void runForAllUsers(
      "weekly",
      previousClosedPeriodAnchor("weekly"),
    ), {
      timezone: timeZone,
    });
    console.log("Background Worker for Weekly Summary Pipeline started.");
  }
}

export class MonthlySummaryPipelineJob {
  static generateMonthlySummaryForUser(
    userId: string,
    anchorDate = new Date(),
    force = false,
  ) {
    return generateSummaryForUser(userId, "monthly", anchorDate, force);
  }

  static startCron() {
    const timeZone = resolveSummaryTimeZone();
    cron.schedule("15 0 1 * *", () => void runForAllUsers(
      "monthly",
      previousClosedPeriodAnchor("monthly"),
    ), { timezone: timeZone });
    console.log("Background Worker for Monthly Summary Pipeline started.");
  }
}

export class YearlySummaryPipelineJob {
  static generateYearlySummaryForUser(
    userId: string,
    anchorDate = new Date(),
    force = false,
  ) {
    return generateSummaryForUser(userId, "yearly", anchorDate, force);
  }

  static startCron() {
    const timeZone = resolveSummaryTimeZone();
    cron.schedule("20 0 1 1 *", () => void runForAllUsers(
      "yearly",
      previousClosedPeriodAnchor("yearly"),
    ), {
      timezone: timeZone,
    });
    console.log("Background Worker for Yearly Summary Pipeline started.");
  }
}
