import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type Samples = Record<string, number[]>;
type BenchmarkMode = "cold" | "warm" | "exactDate";

async function main() {
  const apiUrl = (process.env.PERF_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const token = await readAccessToken();
  const iterations = boundedInteger(process.env.PERF_ITERATIONS, 30, 5, 500);
  const warmups = boundedInteger(process.env.PERF_WARMUPS, 3, 0, 20);
  const modes = parseModes(process.env.PERF_MODES);
  const samples: Samples = {};

  for (let index = 0; index < warmups; index += 1) {
    await runRequest(apiUrl, token, "warmup", index);
  }
  for (const mode of modes) {
    for (let index = 0; index < iterations; index += 1) {
      collect(samples, mode, await runRequest(apiUrl, token, mode, index));
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl,
    iterations,
    warmups,
    modes,
    metrics: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [name, summarize(values)]),
    ),
  };
  const output = resolve(
    process.env.PERF_HTTP_OUTPUT ??
      `.artifacts/performance/http-${Date.now()}.json`,
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`HTTP benchmark report written to ${output}`);
  console.log(JSON.stringify(report.metrics, null, 2));
}

async function readAccessToken() {
  const directToken = process.env.PERF_ACCESS_TOKEN?.trim();
  if (directToken) return directToken;
  const tokenFile = process.env.PERF_ACCESS_TOKEN_FILE?.trim();
  if (tokenFile) {
    const fileToken = (await readFile(tokenFile, "utf8")).trim();
    if (fileToken) return fileToken;
  }
  throw new Error("PERF_ACCESS_TOKEN or PERF_ACCESS_TOKEN_FILE is required.");
}

async function runRequest(
  apiUrl: string,
  token: string,
  mode: BenchmarkMode | "warmup",
  index: number,
) {
  const question = mode === "cold"
    ? `Which concrete project decision should I review for benchmark sample ${Date.now()}-${index}?`
    : mode === "exactDate"
      ? "What did I do on January 1, 2025?"
      : "Which concrete project decision should I review for the benchmark?";
  const startedAt = performance.now();
  const response = await fetch(`${apiUrl}/api/search`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      question,
      answerStrategy: "fast",
      maxDistance: 0.42,
      limit: 8,
    }),
  });
  const headersMs = performance.now() - startedAt;
  if (!response.body) throw new Error("Search response did not include a body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let firstByteMs = headersMs;
  let first = true;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (first) {
      firstByteMs = performance.now() - startedAt;
      first = false;
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();
  const fullHttpMs = performance.now() - startedAt;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const payload = JSON.parse(body) as any;
  const timing = payload.analytics?.timing ?? {};
  return {
    headersMs,
    firstByteMs,
    fullHttpMs,
    embedMs: timing.embedMs,
    retrieveMs: timing.retrieveMs,
    rerankMs: timing.rerankMs,
    firstResultMs: timing.firstResultMs,
    fullAnswerMs: timing.fullAnswerMs ?? timing.totalMs,
    embeddingCold: payload.analytics?.embeddingCache?.status === "cold" ? timing.embedMs : undefined,
    embeddingWarm: payload.analytics?.embeddingCache?.status === "warm" ? timing.embedMs : undefined,
    embeddingSkipped: payload.analytics?.embeddingCache?.status === "skipped" ? timing.embedMs : undefined,
  };
}

function collect(samples: Samples, prefix: string, values: Record<string, unknown>) {
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    (samples[`${prefix}.${name}`] ??= []).push(value);
  }
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    minMs: round(sorted[0] ?? 0),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

function percentile(sorted: number[], quantile: number) {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function parseModes(value: string | undefined): BenchmarkMode[] {
  const supported = new Set<BenchmarkMode>(["cold", "warm", "exactDate"]);
  const modes = (value?.split(",") ?? ["cold", "warm", "exactDate"])
    .map((mode) => mode.trim())
    .filter((mode): mode is BenchmarkMode => supported.has(mode as BenchmarkMode));
  if (!modes.length) throw new Error("PERF_MODES must include cold, warm, or exactDate.");
  return Array.from(new Set(modes));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
