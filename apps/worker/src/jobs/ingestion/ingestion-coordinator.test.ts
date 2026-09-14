import assert from "node:assert/strict";
import test from "node:test";
import type { IndexingJob } from "./indexing-job.ts";
import { IngestionCoordinator } from "./ingestion-coordinator.ts";

function job(sourceType = "diary"): IndexingJob {
  const now = new Date();
  return {
    id: "job-1",
    user_id: "user-1",
    job_type: "index_memory",
    source_type: sourceType,
    source_id: "source-1",
    status: "processing",
    retry_count: 0,
    max_retries: 3,
    error: null,
    payload: {},
    generation: 1,
    run_after: now,
    locked_at: now,
    locked_by: "worker-1",
    processed_at: null,
    created_at: now,
    updated_at: now,
  };
}

test("ingestion coordinator dispatches aliases and records success metrics", async () => {
  const calls: string[] = [];
  const leases = {
    resetStale: async () => 1,
    claim: async () => [job("diary_entry")],
    renew: async () => 1,
    assertCurrent: async () => undefined,
    markSucceeded: async () => true,
    markFailed: async () => "retry",
    release: async () => undefined,
  };
  const coordinator = new IngestionCoordinator(leases as any, {
    diary: async (claimedJob) => {
      calls.push(claimedJob.source_type);
    },
  });

  const result = await coordinator.processPending(10);

  assert.deepEqual(calls, ["diary"]);
  assert.equal(result.resetStale, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.metrics.jobs_claimed_total, 1);
  assert.equal(result.metrics.jobs_succeeded_total, 1);
});

test("ingestion coordinator sends unsupported sources through retry policy", async () => {
  let failure: unknown;
  const leases = {
    resetStale: async () => 0,
    claim: async () => [job("unknown-source")],
    renew: async () => 1,
    assertCurrent: async () => undefined,
    markSucceeded: async () => true,
    markFailed: async (_job: IndexingJob, error: unknown) => {
      failure = error;
      return "dead_letter";
    },
    release: async () => undefined,
  };
  const coordinator = new IngestionCoordinator(leases as any, {});

  const result = await coordinator.processPending(10);

  assert.match(
    failure instanceof Error ? failure.message : "",
    /Unsupported indexing source_type/,
  );
  assert.equal(result.failed, 1);
  assert.equal(result.metrics.jobs_dead_letter_total, 1);
});
