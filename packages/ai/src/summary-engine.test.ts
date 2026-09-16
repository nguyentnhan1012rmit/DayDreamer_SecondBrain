import assert from "node:assert/strict";
import test from "node:test";
import {
  SummaryGenerationEngine,
  type SummaryEngineRecord,
  type SummaryEngineStore,
} from "./summary-engine.ts";

const anchorDate = new Date("2026-08-23T12:00:00.000Z");

function summary(
  overrides: Partial<SummaryEngineRecord> = {},
): SummaryEngineRecord {
  return {
    id: "summary-1",
    summary_type: "daily",
    content: "Existing summary",
    period_start: new Date("2026-08-22T17:00:00.000Z"),
    period_end: new Date("2026-08-23T16:59:59.999Z"),
    created_at: new Date("2026-08-23T16:00:00.000Z"),
    updated_at: new Date("2026-08-23T16:00:00.000Z"),
    source_version: 1n,
    dirty: false,
    ...overrides,
  };
}

function store(
  overrides: Partial<SummaryEngineStore> = {},
): SummaryEngineStore {
  return {
    findExisting: async () => null,
    findLowerSummaries: async () => [],
    findActivity: async () => ({
      diaries: [],
      events: [],
      attachments: [],
      gmail: [],
      drive: [],
      contacts: [],
    }),
    getSourceVersion: async () => 1n,
    save: async ({ type, period, content }) =>
      summary({
        summary_type: type,
        period_start: period.start,
        period_end: period.end,
        content,
      }),
    ensureIndexed: async () => undefined,
    ...overrides,
  };
}

test("summary engine reuses and reindexes an existing summary", async () => {
  const existing = summary();
  let indexed = "";
  const engine = new SummaryGenerationEngine(
    store({
      findExisting: async () => existing,
      ensureIndexed: async (record) => {
        indexed = record.id;
      },
    }),
    { timeZone: "Asia/Ho_Chi_Minh" },
  );

  const result = await engine.generate({
    userId: "user-1",
    type: "daily",
    anchorDate,
  });

  assert.equal(result.status, "existing");
  assert.equal(result.summary, existing);
  assert.equal(indexed, existing.id);
});

test("summary engine generates sanitized content from source activity", async () => {
  let prompt = "";
  let savedContent = "";
  const engine = new SummaryGenerationEngine(
    store({
      findActivity: async () => ({
        diaries: [
          {
            entry_date: new Date("2026-08-23T02:00:00.000Z"),
            raw_text: "Finished the ingestion refactor.",
          },
        ],
        events: [],
        attachments: [],
        gmail: [],
        drive: [],
        contacts: [],
      }),
      save: async ({ type, period, content }) => {
        savedContent = content;
        return summary({
          summary_type: type,
          period_start: period.start,
          period_end: period.end,
          content,
        });
      },
    }),
    {
      timeZone: "Asia/Ho_Chi_Minh",
      generateText: async (value) => {
        prompt = value;
        return "**Key win:** Finished the refactor.  \n";
      },
    },
  );

  const result = await engine.generate({
    userId: "user-1",
    type: "daily",
    anchorDate,
  });

  assert.equal(result.status, "generated");
  assert.match(prompt, /Finished the ingestion refactor/);
  assert.equal(savedContent, "Key win: Finished the refactor.");
});

test("summary engine regenerates a dirty existing summary", async () => {
  let generated = 0;
  const engine = new SummaryGenerationEngine(
    store({
      findExisting: async () => summary({ dirty: true }),
      findActivity: async () => ({
        diaries: [
          {
            entry_date: new Date("2026-08-23T02:00:00.000Z"),
            raw_text: "Late source change",
          },
        ],
        events: [],
        attachments: [],
        gmail: [],
        drive: [],
        contacts: [],
      }),
    }),
    {
      timeZone: "Asia/Ho_Chi_Minh",
      generateText: async () => {
        generated += 1;
        return "Updated summary";
      },
    },
  );

  const result = await engine.generate({
    userId: "user-1",
    type: "daily",
    anchorDate,
  });

  assert.equal(result.status, "generated");
  assert.equal(generated, 1);
});

test("summary engine reads raw activity outside lower-summary coverage", async () => {
  let coveredRanges: Array<{ start: Date; end: Date }> = [];
  let prompt = "";
  const monday = new Date("2026-08-17T00:00:00.000Z");
  const mondayEnd = new Date("2026-08-17T23:59:59.999Z");
  const engine = new SummaryGenerationEngine(
    store({
      findLowerSummaries: async () => [
        summary({
          content: "Monday summary",
          period_start: monday,
          period_end: mondayEnd,
        }),
      ],
      findActivity: async (input) => {
        coveredRanges = input.coveredRanges;
        return {
          diaries: [
            {
              entry_date: new Date("2026-08-18T02:00:00.000Z"),
              raw_text: "Tuesday event missing from daily summaries",
            },
          ],
          events: [],
          attachments: [],
          gmail: [],
          drive: [],
          contacts: [],
        };
      },
    }),
    {
      timeZone: "UTC",
      generateText: async (value) => {
        prompt = value;
        return "Weekly summary";
      },
    },
  );

  await engine.generate({
    userId: "user-1",
    type: "weekly",
    anchorDate: new Date("2026-08-19T12:00:00.000Z"),
  });

  assert.equal(coveredRanges.length, 1);
  assert.match(prompt, /Monday summary/);
  assert.match(prompt, /Tuesday event missing from daily summaries/);
});

test("summary engine leaves a concurrently invalidated result stale", async () => {
  const engine = new SummaryGenerationEngine(
    store({
      findActivity: async () => ({
        diaries: [
          {
            entry_date: new Date("2026-08-23T02:00:00.000Z"),
            raw_text: "Initial context",
          },
        ],
        events: [],
        attachments: [],
        gmail: [],
        drive: [],
        contacts: [],
      }),
      save: async ({ type, period, content, sourceVersion }) =>
        summary({
          summary_type: type,
          period_start: period.start,
          period_end: period.end,
          content,
          source_version: sourceVersion,
          dirty: true,
        }),
    }),
    {
      timeZone: "UTC",
      generateText: async () => "Summary from an outdated snapshot",
    },
  );

  const result = await engine.generate({
    userId: "user-1",
    type: "daily",
    anchorDate,
  });

  assert.equal(result.status, "stale");
  assert.equal(result.summary?.dirty, true);
});

test("summary engine returns locked without reading source data", async () => {
  let existingCalls = 0;
  const engine = new SummaryGenerationEngine(
    store({
      findExisting: async () => {
        existingCalls += 1;
        return null;
      },
    }),
    {
      timeZone: "UTC",
      withLock: async () => ({ acquired: false }),
    },
  );

  const result = await engine.generate({
    userId: "user-1",
    type: "weekly",
    anchorDate,
  });

  assert.equal(result.status, "locked");
  assert.equal(existingCalls, 0);
});
