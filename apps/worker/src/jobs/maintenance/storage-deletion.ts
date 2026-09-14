import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseServiceRoleKey } from "@second-brain/shared";
import { withPostgresAdvisoryLock } from "@second-brain/db";
import * as cron from "node-cron";
import { prisma } from "../../lib/prisma";

type StorageDeletionRow = {
  id: string;
  bucket: string;
  storage_path: string;
  retry_count: number;
  max_retries: number;
};

type StorageDeletionDatabase = {
  storageDeletionOutbox: {
    findMany(input: unknown): Promise<StorageDeletionRow[]>;
    update(input: unknown): Promise<unknown>;
  };
};

export async function drainStorageDeletionOutbox(
  db: StorageDeletionDatabase,
  deleteObject: (bucket: string, path: string) => Promise<void>,
  batchSize = 100,
) {
  const rows = await db.storageDeletionOutbox.findMany({
    where: { status: { in: ["pending", "retry"] }, run_after: { lte: new Date() } },
    orderBy: [{ run_after: "asc" }, { created_at: "asc" }],
    take: Math.min(Math.max(Math.trunc(batchSize), 1), 500),
  });
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await deleteObject(row.bucket, row.storage_path);
      await db.storageDeletionOutbox.update({
        where: { id: row.id },
        data: {
          status: "succeeded",
          error: null,
          processed_at: new Date(),
        },
      });
      succeeded += 1;
    } catch (error) {
      const retryCount = row.retry_count + 1;
      const exhausted = retryCount >= row.max_retries;
      const delayMs = Math.min(60 * 60_000, 2 ** retryCount * 5_000);
      await db.storageDeletionOutbox.update({
        where: { id: row.id },
        data: {
          status: exhausted ? "dead_letter" : "retry",
          retry_count: retryCount,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
          run_after: new Date(Date.now() + delayMs),
          processed_at: exhausted ? new Date() : null,
        },
      });
      failed += 1;
    }
  }
  return { found: rows.length, succeeded, failed };
}

export class StorageDeletionJob {
  static async run() {
    const lock = await withPostgresAdvisoryLock(
      "storage-deletion-outbox",
      () =>
        drainStorageDeletionOutbox(prisma, async (bucket, path) => {
          const supabase = getSupabaseClient();
          const { error } = await supabase.storage.from(bucket).remove([path]);
          if (error) throw error;
        }),
    );
    return lock.acquired ? lock.value : null;
  }

  static startCron() {
    void this.run().catch((error) => {
      console.error("[Worker - Storage deletion] Initial run failed:", error);
    });
    cron.schedule("*/1 * * * *", () => {
      void this.run().catch((error) => {
        console.error("[Worker - Storage deletion] Failed:", error);
      });
    });
    console.log("Background Worker for storage deletion outbox started.");
  }
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = resolveSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error("Supabase URL and server-side key must be set.");
  }
  return createClient(url, key);
}
