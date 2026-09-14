import assert from "node:assert/strict";
import test from "node:test";
import {
  getClientPerformanceSnapshot,
  recordClientPerformance,
  resetClientPerformance,
} from "./client-performance";

test("client performance reports p50, p95 and p99", () => {
  resetClientPerformance();
  for (let duration = 1; duration <= 100; duration += 1) {
    recordClientPerformance("yearly.render", duration);
  }

  assert.deepEqual(getClientPerformanceSnapshot(), [
    {
      name: "yearly.render",
      count: 100,
      p50Ms: 50,
      p95Ms: 95,
      p99Ms: 99,
      maxMs: 100,
      lastMs: 100,
    },
  ]);
});
