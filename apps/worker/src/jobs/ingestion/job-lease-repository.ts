import type { IndexingJob } from "./indexing-job";
import { RetryPolicy } from "./retry-policy";
import {
  bumpUserMemoryRevision,
  expireUserSearchHistory,
} from "@second-brain/db";

export class LostIndexingLeaseError extends Error {
  constructor(jobId: string) {
    super(`Indexing lease or generation is no longer current for job ${jobId}.`);
    this.name = "LostIndexingLeaseError";
  }
}

export class JobLeaseRepository {
  constructor(
    private readonly db: any,
    private readonly workerId: string,
    private readonly retryPolicy = new RetryPolicy(),
  ) {}

  claim(batchSize: number) {
    const size = Math.min(Math.max(Math.floor(batchSize), 1), 100);
    const sourceId =
      process.env.INDEXING_WORKER_SOURCE_ID_FILTER?.trim() || null;
    return this.db.$queryRawUnsafe(
      `
      WITH candidates AS (
        SELECT id FROM indexing_outbox
        WHERE job_type = 'index_memory'
          AND status IN ('pending', 'retry')
          AND run_after <= now()
          AND ($3::text IS NULL OR source_id = $3)
        ORDER BY
          CASE source_type
            WHEN 'diary' THEN 0 WHEN 'calendar' THEN 1 WHEN 'gmail' THEN 2
            WHEN 'contact' THEN 3 WHEN 'summary' THEN 4
            WHEN 'attachment' THEN 5 WHEN 'drive' THEN 6 ELSE 7
          END,
          run_after, created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE indexing_outbox AS job
      SET status = 'processing', locked_at = now(), locked_by = $2, updated_at = now()
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.*
      `,
      size,
      this.workerId,
      sourceId,
    ) as Promise<IndexingJob[]>;
  }

  async resetStale(leaseTimeoutMs: number) {
    const rows = (await this.db.$queryRawUnsafe(
      `
      UPDATE indexing_outbox
      SET status = 'retry', run_after = now(), locked_at = NULL,
          locked_by = NULL, updated_at = now(),
          error = COALESCE(error, 'Job lock expired and was requeued.')
      WHERE status = 'processing'
        AND locked_at < now() - ($1 * interval '1 millisecond')
      RETURNING id
      `,
      leaseTimeoutMs,
    )) as Array<{ id: string }>;
    return rows.length;
  }

  async renew(jobIds: string[]) {
    if (!jobIds.length) return 0;
    const rows = (await this.db.$queryRawUnsafe(
      `UPDATE indexing_outbox
       SET locked_at = now(), updated_at = now()
       WHERE id = ANY($1::text[]) AND status = 'processing' AND locked_by = $2
       RETURNING id`,
      jobIds,
      this.workerId,
    )) as Array<{ id: string }>;
    return rows.length;
  }

  async release(jobIds: string[]) {
    if (!jobIds.length) return;
    await this.db.$executeRawUnsafe(
      `UPDATE indexing_outbox
       SET status = 'retry', run_after = now(), locked_at = NULL,
           locked_by = NULL, updated_at = now(),
           error = COALESCE(error, 'Worker released an unfinished indexing lease.')
       WHERE id = ANY($1::text[]) AND status = 'processing' AND locked_by = $2`,
      jobIds,
      this.workerId,
    );
  }

  async assertCurrent(job: IndexingJob, db: any = this.db) {
    const rows = (await db.$queryRawUnsafe(
      `SELECT id FROM indexing_outbox
       WHERE id = $1::text
         AND status = 'processing'
         AND locked_by = $2
         AND generation = $3
       FOR UPDATE`,
      job.id,
      this.workerId,
      job.generation,
    )) as Array<{ id: string }>;
    if (rows.length !== 1) throw new LostIndexingLeaseError(job.id);
  }

  async markSucceeded(job: IndexingJob) {
    return this.db.$transaction(async (tx: any) => {
      const result = await tx.indexingOutbox.updateMany({
        where: {
          id: job.id,
          status: "processing",
          locked_by: this.workerId,
          generation: job.generation,
        },
        data: {
          status: "succeeded",
          error: null,
          locked_at: null,
          locked_by: null,
          processed_at: new Date(),
        },
      });
      if (result.count !== 1) return false;
      await bumpUserMemoryRevision(tx, job.user_id);
      await expireUserSearchHistory(tx, job.user_id);
      return true;
    });
  }

  async markFailed(job: IndexingJob, error: unknown) {
    const transition = this.retryPolicy.transition(job, error);
    if (transition.requiresReconnect) {
      await this.markReconnectRequired(job, transition.message);
    }
    const result = await this.db.indexingOutbox.updateMany({
      where: {
        id: job.id,
        status: "processing",
        locked_by: this.workerId,
        generation: job.generation,
      },
      data: {
        status: transition.status,
        retry_count: transition.retryCount,
        error: transition.message,
        run_after: transition.runAfter,
        locked_at: null,
        locked_by: null,
        processed_at: transition.status === "dead_letter" ? new Date() : null,
      },
    });
    return result.count === 0 ? "lost_lease" : transition.status;
  }

  private async markReconnectRequired(job: IndexingJob, error: string) {
    const source = this.retryPolicy.googleSource(job.source_type);
    if (!source) return;
    try {
      await this.db.$executeRawUnsafe(
        `UPDATE google_connections
         SET connected = false, last_error = $3, last_error_at = now(), updated_at = now()
         WHERE user_id = $1::text AND source = $2`,
        job.user_id,
        source,
        `Needs reconnect: ${error}`.slice(0, 1000),
      );
    } catch {
      // Older development databases may not have google_connections yet.
    }
  }
}
