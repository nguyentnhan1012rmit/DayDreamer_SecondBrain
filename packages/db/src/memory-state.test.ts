import assert from "node:assert/strict";
import test from "node:test";
import {
  markDependentSummariesDirty,
  markMemorySourcesChanged,
} from "./memory-state.ts";

test("source changes increment the watermark and invalidate overlapping summaries", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
      queries.push({ sql, values });
      return [{ memory_revision: 8n }];
    },
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => {
      queries.push({ sql, values });
      return 1;
    },
  };
  const changedAt = new Date("2026-09-06T03:00:00.000Z");

  const revision = await markMemorySourcesChanged(db, {
    userId: "user-1",
    occurredFrom: changedAt,
    occurredTo: changedAt,
  });

  assert.equal(revision, 8n);
  assert.equal(queries.length, 3);
  assert.match(queries[0]!.sql, /memory_revision = memory_revision \+ 1/);
  assert.match(queries[1]!.sql, /SET dirty = TRUE/);
  assert.match(queries[1]!.sql, /source_type = 'summary'/);
  assert.deepEqual(queries[1]!.values, ["user-1", changedAt, changedAt]);
  assert.match(queries[2]!.sql, /UPDATE search_history/);
});

test("regenerating a lower summary invalidates only higher summary levels", async () => {
  let sql = "";
  const db = {
    $queryRawUnsafe: async () => [],
    $executeRawUnsafe: async (value: string) => {
      sql = value;
      return 1;
    },
  };

  await markDependentSummariesDirty(db, {
    userId: "user-1",
    summaryType: "weekly",
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-07T00:00:00.000Z"),
  });

  assert.match(sql, /END > \$2/);
  assert.match(sql, /period_end >= \$3/);
});
