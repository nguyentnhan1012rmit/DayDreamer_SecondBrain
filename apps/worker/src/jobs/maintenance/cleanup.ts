import { withPostgresAdvisoryLock } from "@second-brain/db";
import * as cron from "node-cron";
import { prisma } from "../../lib/prisma";

export type CleanupResult = {
  succeededOutboxJobs: number;
  succeededStorageDeletionJobs: number;
  expiredSearchRows: number;
};

type CleanupDatabase = {
  $queryRawUnsafe: (
    query: string,
    ...values: unknown[]
  ) => Promise<Array<{ id: string }>>;
};

export async function cleanupExpiredRows(
  db: CleanupDatabase,
  options: { now?: Date; retentionDays?: number; batchSize?: number } = {},
): Promise<CleanupResult> {
  const now = options.now ?? new Date();
  const retentionDays = clamp(options.retentionDays ?? 7, 1, 365);
  const batchSize = clamp(options.batchSize ?? 1_000, 10, 10_000);
  const processedBefore = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1_000,
  );

  const [outboxRows, storageDeletionRows, searchRows] = await Promise.all([
    db.$queryRawUnsafe(
      `WITH doomed AS (
         SELECT id FROM indexing_outbox
         WHERE status = 'succeeded' AND processed_at < $1
         ORDER BY processed_at ASC
         LIMIT $2
       )
       DELETE FROM indexing_outbox AS target
       USING doomed
       WHERE target.id = doomed.id
       RETURNING target.id`,
      processedBefore,
      batchSize,
    ),
    db.$queryRawUnsafe(
      `WITH doomed AS (
         SELECT id FROM storage_deletion_outbox
         WHERE status = 'succeeded' AND processed_at < $1
         ORDER BY processed_at ASC
         LIMIT $2
       )
       DELETE FROM storage_deletion_outbox AS target
       USING doomed
       WHERE target.id = doomed.id
       RETURNING target.id`,
      processedBefore,
      batchSize,
    ),
    db.$queryRawUnsafe(
      `WITH doomed AS (
         SELECT id FROM search_history
         WHERE expires_at < $1
         ORDER BY expires_at ASC
         LIMIT $2
       )
       DELETE FROM search_history AS target
       USING doomed
       WHERE target.id = doomed.id
       RETURNING target.id`,
      now,
      batchSize,
    ),
  ]);

  return {
    succeededOutboxJobs: outboxRows.length,
    succeededStorageDeletionJobs: storageDeletionRows.length,
    expiredSearchRows: searchRows.length,
  };
}

export class CleanupJob {
  static async run() {
    const retentionDays = clamp(
      Number(process.env.OUTBOX_SUCCESS_RETENTION_DAYS ?? 7),
      1,
      365,
    );
    const batchSize = clamp(
      Number(process.env.CLEANUP_BATCH_SIZE ?? 1_000),
      10,
      10_000,
    );
    const maxBatches = clamp(
      Number(process.env.CLEANUP_MAX_BATCHES ?? 20),
      1,
      100,
    );
    const lock = await withPostgresAdvisoryLock(
      "worker-maintenance-cleanup",
      async () => {
        const total: CleanupResult = {
          succeededOutboxJobs: 0,
          succeededStorageDeletionJobs: 0,
          expiredSearchRows: 0,
        };
        for (let batch = 0; batch < maxBatches; batch += 1) {
          const result = await cleanupExpiredRows(prisma, {
            retentionDays,
            batchSize,
          });
          total.succeededOutboxJobs += result.succeededOutboxJobs;
          total.succeededStorageDeletionJobs +=
            result.succeededStorageDeletionJobs;
          total.expiredSearchRows += result.expiredSearchRows;
          if (
            result.succeededOutboxJobs < batchSize &&
            result.succeededStorageDeletionJobs < batchSize &&
            result.expiredSearchRows < batchSize
          ) {
            break;
          }
        }
        return total;
      },
    );
    if (!lock.acquired) {
      console.log("[Worker - Cleanup] Another worker owns the lock; skipping.");
      return null;
    }
    console.log(`[Worker - Cleanup] ${JSON.stringify(lock.value)}`);
    return lock.value;
  }

  static startCron() {
    cron.schedule("15 3 * * *", () => {
      void this.run().catch((error) => {
        console.error("[Worker - Cleanup] Failed:", error);
      });
    });
    console.log("Background Worker for data cleanup started.");
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
