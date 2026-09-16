import assert from "node:assert/strict";
import test from "node:test";
import { withPostgresAdvisoryLock } from "./advisory-lock.ts";

test("advisory lock skips work when another session owns the key", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  let called = false;
  let ended = false;
  try {
    const result = await withPostgresAdvisoryLock(
      "summary:user-1",
      async () => {
        called = true;
      },
      {
        connectionString: "postgres://test",
        createClient: () =>
          ({
            connect: async () => undefined,
            query: async () => ({ rows: [{ acquired: false }] }),
            end: async () => {
              ended = true;
            },
          }) as any,
      },
    );

    assert.deepEqual(result, { acquired: false });
    assert.equal(called, false);
    assert.equal(ended, true);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("advisory lock releases its session after callback failure", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  const queries: string[] = [];
  let ended = false;
  try {
    await assert.rejects(
      withPostgresAdvisoryLock(
        "calendar-sync-cron",
        async () => {
          throw new Error("sync failed");
        },
        {
          connectionString: "postgres://test",
          createClient: () =>
            ({
              connect: async () => undefined,
              query: async (query: string) => {
                queries.push(query);
                return { rows: [{ acquired: true }] };
              },
              end: async () => {
                ended = true;
              },
            }) as any,
        },
      ),
      /sync failed/,
    );

    assert.equal(queries.length, 2);
    assert.match(queries[1] ?? "", /pg_advisory_unlock/);
    assert.equal(ended, true);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
