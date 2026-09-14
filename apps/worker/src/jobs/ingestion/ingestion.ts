import * as cron from "node-cron";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { prisma } from "../../lib/prisma";
import { IngestionCoordinator } from "./ingestion-coordinator";
import { JobLeaseRepository } from "./job-lease-repository";
import { RealtimeListener } from "./realtime-listener";

const workerId = (
  process.env.INDEXING_WORKER_ID ??
  `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
).slice(0, 128);

const coordinator = new IngestionCoordinator(
  new JobLeaseRepository(prisma, workerId),
);
const listener = new RealtimeListener(workerId, () =>
  coordinator.requestDrain("realtime"),
);

export class DataIngestionJob {
  static processPendingAttachments() {
    return coordinator.processPending();
  }

  static processPendingIndexingJobs(batchSize?: number) {
    return coordinator.processPending(batchSize);
  }

  static startCron() {
    cron.schedule("*/1 * * * *", () => {
      void coordinator.requestDrain("cron");
    });
    console.log("Background Worker for IndexingOutbox ingestion started.");
  }

  static startRealtimeListener() {
    listener.start();
  }

  static async stopRealtimeListener() {
    coordinator.stop();
    await listener.stop();
  }

  static getMetrics() {
    return coordinator.getMetrics();
  }
}
