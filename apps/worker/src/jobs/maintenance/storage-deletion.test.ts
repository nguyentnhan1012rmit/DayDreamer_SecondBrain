import assert from "node:assert/strict";
import test from "node:test";
import { drainStorageDeletionOutbox } from "./storage-deletion.ts";

test("storage deletion outbox marks an idempotent removal as succeeded", async () => {
  const updates: unknown[] = [];
  const db = {
    storageDeletionOutbox: {
      findMany: async () => [
        {
          id: "delete-1",
          bucket: "attachments-bucket",
          storage_path: "attachments/user/file.pdf",
          retry_count: 0,
          max_retries: 3,
        },
      ],
      update: async (input: unknown) => updates.push(input),
    },
  };
  const removed: string[] = [];

  const result = await drainStorageDeletionOutbox(
    db,
    async (bucket, path) => removed.push(`${bucket}/${path}`),
  );

  assert.deepEqual(result, { found: 1, succeeded: 1, failed: 0 });
  assert.deepEqual(removed, [
    "attachments-bucket/attachments/user/file.pdf",
  ]);
  assert.equal((updates[0] as any).data.status, "succeeded");
});
