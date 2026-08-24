import assert from "node:assert/strict";
import { test } from "node:test";
import { getUserSearchHistory, saveSearchHistory } from "./search-history.ts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

test("saveSearchHistory immediately expires cache-ineligible history", async () => {
  let savedData: Record<string, unknown> | undefined;
  const client = {
    searchHistory: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        savedData = data;
        return data;
      },
    },
  };

  await saveSearchHistory(client, {
    userId: "user-1",
    question: "What is in this attachment?",
    answer: "Scoped answer",
    confidence: "high",
    responseLanguage: "en",
    tokenCount: 7,
    cacheEligible: false,
    analyticsJson: JSON.stringify({ status: "success" }),
    sourceScope: {
      sourceType: "attachment",
      sourceId: "attachment-1",
    },
  });

  const createdAt = savedData?.created_at;
  const expiresAt = savedData?.expires_at;
  assert.ok(createdAt instanceof Date);
  assert.ok(expiresAt instanceof Date);
  assert.equal(expiresAt.getTime(), createdAt.getTime());
  const analyticsJson = savedData?.analytics_json;
  assert.ok(typeof analyticsJson === "string");
  assert.deepEqual(JSON.parse(analyticsJson), {
    status: "success",
    queryScope: {
      sourceType: "attachment",
      sourceId: "attachment-1",
    },
  });
});

test("saveSearchHistory keeps the default cache TTL for eligible history", async () => {
  let savedData: Record<string, unknown> | undefined;
  const client = {
    searchHistory: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        savedData = data;
        return data;
      },
    },
  };

  await saveSearchHistory(client, {
    userId: "user-1",
    question: "What did I work on?",
    answer: "Global answer",
    confidence: "high",
    responseLanguage: "en",
    tokenCount: 7,
  });

  const createdAt = savedData?.created_at;
  const expiresAt = savedData?.expires_at;
  assert.ok(createdAt instanceof Date);
  assert.ok(expiresAt instanceof Date);
  assert.equal(expiresAt.getTime() - createdAt.getTime(), CACHE_TTL_MS);
});

test("getUserSearchHistory restores source scope without exposing analytics", async () => {
  const client = {
    searchHistory: {
      findMany: async () => [
        {
          id: "history-1",
          question: "What is in this attachment?",
          analytics_json: JSON.stringify({
            queryScope: {
              sourceType: "attachment",
              sourceId: "attachment-1",
            },
          }),
        },
        {
          id: "history-2",
          question: "What did I work on?",
          analytics_json: null,
        },
      ],
    },
  };

  const history = await getUserSearchHistory(client, "user-1");
  assert.deepEqual(history, [
    {
      id: "history-1",
      question: "What is in this attachment?",
      source_scope: {
        sourceType: "attachment",
        sourceId: "attachment-1",
      },
    },
    {
      id: "history-2",
      question: "What did I work on?",
      source_scope: null,
    },
  ]);
});
