import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  generateTuturuuuJsonWithMeta,
  parseJsonResponse,
} from "./tuturuuu-json.ts";

test("generateTuturuuuJsonWithMeta keeps one idempotency key across transient retries", async () => {
  const previousApiKey = process.env.TUTURUUU_AI_API_KEY;
  const previousBaseUrl = process.env.TUTURUUU_AI_BASE_URL;
  const originalFetch = globalThis.fetch;
  const requests: RequestInit[] = [];

  process.env.TUTURUUU_AI_API_KEY = "test-tuturuuu-key";
  process.env.TUTURUUU_AI_BASE_URL = "https://unit.test/v1";
  globalThis.fetch = (async (_url, init) => {
    requests.push(init ?? {});
    if (requests.length === 1) {
      return new Response(
        JSON.stringify({ error: { code: "unavailable", message: "Try again." } }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ output_text: '{"answer":"Recovered"}' }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await generateTuturuuuJsonWithMeta({
      model: "gemini-3.5-flash-lite",
      prompt: "Return an answer.",
      responseSchema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
      validator: z.object({ answer: z.string() }),
      temperature: 0,
      idempotencyKey: "logical-request-1",
      maxRetries: 1,
      maxFormatRetries: 0,
      maxRetryDelayMs: 0,
    });

    assert.equal(result.data.answer, "Recovered");
    assert.equal(requests.length, 2);
    const firstHeaders = requests[0]?.headers as Record<string, string>;
    const secondHeaders = requests[1]?.headers as Record<string, string>;
    assert.equal(firstHeaders["Idempotency-Key"], "logical-request-1");
    assert.equal(secondHeaders["Idempotency-Key"], "logical-request-1");
    assert.equal(requests[0]?.body, requests[1]?.body);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.TUTURUUU_AI_API_KEY;
    else process.env.TUTURUUU_AI_API_KEY = previousApiKey;
    if (previousBaseUrl === undefined) delete process.env.TUTURUUU_AI_BASE_URL;
    else process.env.TUTURUUU_AI_BASE_URL = previousBaseUrl;
  }
});

test("generateTuturuuuJsonWithMeta uses a derived key when format repair changes the prompt", async () => {
  const previousApiKey = process.env.TUTURUUU_AI_API_KEY;
  const previousBaseUrl = process.env.TUTURUUU_AI_BASE_URL;
  const originalFetch = globalThis.fetch;
  const requests: RequestInit[] = [];

  process.env.TUTURUUU_AI_API_KEY = "test-tuturuuu-key";
  process.env.TUTURUUU_AI_BASE_URL = "https://unit.test/v1";
  globalThis.fetch = (async (_url, init) => {
    requests.push(init ?? {});
    return new Response(
      JSON.stringify({
        output_text: requests.length === 1 ? "not-json" : '{"answer":"Repaired"}',
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await generateTuturuuuJsonWithMeta({
      model: "gemini-3.5-flash-lite",
      prompt: "Return an answer.",
      responseSchema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
      validator: z.object({ answer: z.string() }),
      idempotencyKey: "logical-request-2",
      maxRetries: 0,
      maxFormatRetries: 1,
    });

    assert.equal(result.data.answer, "Repaired");
    assert.equal(requests.length, 2);
    const firstHeaders = requests[0]?.headers as Record<string, string>;
    const secondHeaders = requests[1]?.headers as Record<string, string>;
    assert.equal(firstHeaders["Idempotency-Key"], "logical-request-2");
    assert.equal(
      secondHeaders["Idempotency-Key"],
      "logical-request-2-format-1",
    );
    assert.notEqual(requests[0]?.body, requests[1]?.body);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.TUTURUUU_AI_API_KEY;
    else process.env.TUTURUUU_AI_API_KEY = previousApiKey;
    if (previousBaseUrl === undefined) delete process.env.TUTURUUU_AI_BASE_URL;
    else process.env.TUTURUUU_AI_BASE_URL = previousBaseUrl;
  }
});

test("parseJsonResponse extracts valid JSON from surrounding prose", () => {
  const parsed = parseJsonResponse(`
Here is the JSON response:

{
  "answer": "Calendar sync is implemented at code level.",
  "confidence": "medium",
  "citations": [
    { "marker": "S1", "claim": "Calendar sync is implemented" }
  ]
}

Hope this helps.
`);

  assert.deepEqual(parsed, {
    answer: "Calendar sync is implemented at code level.",
    confidence: "medium",
    citations: [
      { marker: "S1", claim: "Calendar sync is implemented" },
    ],
  });
});

test("parseJsonResponse strips markdown fences before parsing", () => {
  const parsed = parseJsonResponse(`
\`\`\`json
{
  "answer": "The memory is insufficient.",
  "confidence": "low",
  "citations": []
}
\`\`\`
`);

  assert.deepEqual(parsed, {
    answer: "The memory is insufficient.",
    confidence: "low",
    citations: [],
  });
});

test("parseJsonResponse repairs truncated JSON when possible", () => {
  const parsed = parseJsonResponse(`{
  "answer": "I felt stressed about the demo",
  "confidence": "low",
  "citations": [
    { "marker": "S1", "claim": "felt stressed about the demo" }
  ]
`);

  assert.deepEqual(parsed, {
    answer: "I felt stressed about the demo",
    confidence: "low",
    citations: [
      { marker: "S1", claim: "felt stressed about the demo" },
    ],
  });
});
