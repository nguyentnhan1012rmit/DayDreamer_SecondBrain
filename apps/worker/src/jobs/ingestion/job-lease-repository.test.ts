import assert from "node:assert/strict";
import test from "node:test";
import type { IndexingJob } from "./indexing-job.ts";
import {
  JobLeaseRepository,
  LostIndexingLeaseError,
} from "./job-lease-repository.ts";

function job(): IndexingJob {
  const now = new Date();
  return {
    id: "job-1",
    user_id: "user-1",
    job_type: "index_memory",
    source_type: "diary",
    source_id: "diary-1",
    status: "processing",
    retry_count: 0,
    max_retries: 3,
    error: null,
    payload: {},
    generation: 4,
    run_after: now,
    locked_at: now,
    locked_by: "worker-1",
    processed_at: null,
    created_at: now,
    updated_at: now,
  };
}

test("lease assertion includes the claimed job generation", async () => {
  const calls: unknown[][] = [];
  const db = {
    $queryRawUnsafe: async (...args: unknown[]) => {
      calls.push(args);
      return [{ id: "job-1" }];
    },
  };
  const leases = new JobLeaseRepository(db as any, "worker-1");

  await leases.assertCurrent(job());

  assert.match(String(calls[0]![0]), /generation = \$3/);
  assert.deepEqual(calls[0]!.slice(1), ["job-1", "worker-1", 4]);
});

test("lease assertion rejects a stale generation before persistence", async () => {
  const leases = new JobLeaseRepository(
    { $queryRawUnsafe: async () => [] } as any,
    "worker-1",
  );

  await assert.rejects(
    () => leases.assertCurrent(job()),
    LostIndexingLeaseError,
  );
});
