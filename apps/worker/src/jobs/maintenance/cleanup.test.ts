import assert from "node:assert/strict";
import test from "node:test";
import { cleanupExpiredRows } from "./cleanup.ts";

test("cleanup removes retained successes and expired search rows in bounded batches", async () => {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const db = {
    $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
      calls.push({ query, values });
      if (query.includes("indexing_outbox")) {
        return [{ id: "outbox-1" }, { id: "outbox-2" }];
      }
      if (query.includes("storage_deletion_outbox")) {
        return [{ id: "storage-delete-1" }];
      }
      return [{ id: "search-1" }];
    },
  };
  const now = new Date("2026-09-05T00:00:00.000Z");

  const result = await cleanupExpiredRows(db, {
    now,
    retentionDays: 7,
    batchSize: 250,
  });

  assert.deepEqual(result, {
    succeededOutboxJobs: 2,
    succeededStorageDeletionJobs: 1,
    expiredSearchRows: 1,
  });
  assert.equal(calls.length, 3);
  assert.equal(
    (calls[0]?.values[0] as Date).toISOString(),
    "2026-08-29T00:00:00.000Z",
  );
  assert.equal(calls[0]?.values[1], 250);
  assert.equal(
    (calls[1]?.values[0] as Date).toISOString(),
    "2026-08-29T00:00:00.000Z",
  );
  assert.equal(calls[1]?.values[1], 250);
  assert.equal((calls[2]?.values[0] as Date).toISOString(), now.toISOString());
  assert.equal(calls[2]?.values[1], 250);
});
