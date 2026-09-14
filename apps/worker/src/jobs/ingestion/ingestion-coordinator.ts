import type { WorkerMetricsSnapshot } from "../../metrics";
import {
  normalizeSourceType,
  type IndexingSource,
  type SourceProcessor,
} from "./indexing-job";
import { JobLeaseRepository } from "./job-lease-repository";
import { sourceProcessors } from "./processors";
import { SingleFlight } from "./reliability";

export type DrainResult = {
  found: number;
  claimed: number;
  succeeded: number;
  failed: number;
  resetStale: number;
  metrics: WorkerMetricsSnapshot;
};

type DrainTrigger = "cron" | "realtime";

export class IngestionCoordinator {
  private readonly drainFlight = new SingleFlight<DrainResult>();
  private readonly coordinatorFlight = new SingleFlight<void>();
  private drainRequested = false;
  private stopping = false;
  private metrics: WorkerMetricsSnapshot = {
    jobs_claimed_total: 0,
    jobs_succeeded_total: 0,
    jobs_failed_total: 0,
    jobs_dead_letter_total: 0,
    job_duration_ms: { count: 0, last: 0, sum: 0, avg: 0, max: 0 },
  };

  constructor(
    private readonly leases: JobLeaseRepository,
    private readonly processors: Partial<
      Record<IndexingSource, SourceProcessor>
    > = sourceProcessors,
  ) {}

  processPending(batchSize = this.getWorkerBatchSize()) {
    return this.drainFlight.run(() => this.processBatch(batchSize));
  }

  requestDrain(trigger: DrainTrigger) {
    if (this.stopping) return Promise.resolve();
    this.drainRequested = true;
    const run = this.coordinatorFlight.run(async () => {
      const maxBatches = this.getAutomaticDrainMaxBatches();
      let batches = 0;

      while (!this.stopping && this.drainRequested && batches < maxBatches) {
        this.drainRequested = false;
        while (!this.stopping && batches < maxBatches) {
          const result = await this.processPending(this.getWorkerBatchSize());
          batches += 1;
          if (result.claimed > 0 || result.resetStale > 0) {
            console.log(
              `[Worker - Ingestion] ${trigger} ${JSON.stringify(result)}`,
            );
          }
          if (result.claimed === 0) break;
        }
      }

      if (batches >= maxBatches) this.drainRequested = true;
    });

    void run
      .catch((error) => {
        console.error(`[Worker - Ingestion] ${trigger} drain failed:`, error);
      })
      .finally(() => {
        if (this.drainRequested && !this.stopping) {
          setImmediate(() => void this.requestDrain(trigger));
        }
      });
    return run;
  }

  stop() {
    this.stopping = true;
    this.drainRequested = false;
  }

  getMetrics(): WorkerMetricsSnapshot {
    return {
      ...this.metrics,
      job_duration_ms: { ...this.metrics.job_duration_ms },
    };
  }

  private async processBatch(batchSize: number): Promise<DrainResult> {
    const resetStale = await this.leases.resetStale(this.getLeaseTimeoutMs());
    const jobs = await this.leases.claim(batchSize);
    const result: DrainResult = {
      found: jobs.length,
      claimed: jobs.length,
      succeeded: 0,
      failed: 0,
      resetStale,
      metrics: this.getMetrics(),
    };
    this.metrics.jobs_claimed_total += jobs.length;
    const stopRenewal = this.startLeaseRenewal(jobs.map((job) => job.id));

    try {
      for (const [index, job] of jobs.entries()) {
        if (this.stopping) break;
        const startedAt = Date.now();
        try {
          await this.leases.renew([job.id]);
          const source = normalizeSourceType(job.source_type);
          const processor = this.processors[source as IndexingSource];
          if (!processor) {
            throw new Error(
              `Unsupported indexing source_type: ${job.source_type}`,
            );
          }
          const normalizedJob = { ...job, source_type: source };
          await processor(normalizedJob, {
            assertLeaseCurrent: (db) =>
              this.leases.assertCurrent(job, db),
          });
          await this.leases.assertCurrent(job);
          if (!(await this.leases.markSucceeded(job))) {
            throw new Error(
              `Indexing lease lost before job ${job.id} could be completed.`,
            );
          }
          result.succeeded += 1;
          this.metrics.jobs_succeeded_total += 1;
        } catch (error) {
          result.failed += 1;
          this.metrics.jobs_failed_total += 1;
          const status = await this.leases.markFailed(job, error);
          if (status === "dead_letter") {
            this.metrics.jobs_dead_letter_total += 1;
          }
          console.warn(
            `[Worker - Ingestion] Job ${job.id} (${job.source_type}/${job.source_id}) ${status === "dead_letter" ? "dead-lettered" : status === "lost_lease" ? "lost its lease" : "scheduled for retry"}: ${this.toErrorMessage(error)}`,
          );
        } finally {
          this.recordDuration(Date.now() - startedAt);
        }

        if (index < jobs.length - 1) {
          await this.sleep(this.getInterJobDelayMs());
        }
      }
    } finally {
      stopRenewal();
      await this.leases.release(jobs.map((job) => job.id)).catch((error) => {
        console.warn(
          `[Worker - Ingestion] Could not release unfinished leases: ${this.toErrorMessage(error)}`,
        );
      });
    }

    result.metrics = this.getMetrics();
    return result;
  }

  private startLeaseRenewal(jobIds: string[]) {
    if (!jobIds.length) return () => undefined;
    const timer = setInterval(() => {
      void this.leases.renew(jobIds).catch((error) => {
        console.warn(
          `[Worker - Ingestion] Could not renew indexing leases: ${this.toErrorMessage(error)}`,
        );
      });
    }, this.getLeaseRenewIntervalMs());
    timer.unref?.();
    return () => clearInterval(timer);
  }

  private recordDuration(durationMs: number) {
    const current = this.metrics.job_duration_ms;
    const count = current.count + 1;
    const sum = current.sum + durationMs;
    this.metrics.job_duration_ms = {
      count,
      last: durationMs,
      sum,
      avg: Math.round(sum / count),
      max: Math.max(current.max, durationMs),
    };
  }

  private getWorkerBatchSize() {
    return this.integerEnv("INDEXING_WORKER_BATCH_SIZE", 10, 1, 100);
  }

  private getLeaseTimeoutMs() {
    return this.integerEnv("INDEXING_LEASE_TIMEOUT_MS", 10 * 60_000, 30_000);
  }

  private getLeaseRenewIntervalMs() {
    return this.integerEnv(
      "INDEXING_LEASE_RENEW_INTERVAL_MS",
      Math.max(10_000, Math.floor(this.getLeaseTimeoutMs() / 3)),
      5_000,
    );
  }

  private getInterJobDelayMs() {
    return this.integerEnv("INDEXING_INTER_JOB_DELAY_MS", 0, 0, 60_000);
  }

  private getAutomaticDrainMaxBatches() {
    return this.integerEnv("INDEXING_AUTOMATIC_DRAIN_MAX_BATCHES", 20, 1, 100);
  }

  private integerEnv(
    name: string,
    fallback: number,
    min: number,
    max = Infinity,
  ) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.trunc(value), min), max);
  }

  private async sleep(ms: number) {
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
