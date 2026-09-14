import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";

type ExplainPlan = {
  Plan: Record<string, unknown>;
  "Planning Time": number;
  "Execution Time": number;
};

const sizes = [365, 1_000, 10_000];
const queryVector = buildVector(7);

async function main() {
  const connectionString = process.env.PERF_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("PERF_DATABASE_URL is required.");
  }
  const pool = new Pool({ connectionString, max: 1 });
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    databaseHost: new URL(connectionString).hostname,
    datasets: {},
  };

  try {
    const client = await pool.connect();
    try {
      await client.query("SET hnsw.ef_search = 80");
      await client.query("SET hnsw.iterative_scan = 'strict_order'");
      for (const size of sizes) {
        const userResult = await client.query<{ id: string }>(
          "SELECT id FROM users WHERE email = $1 LIMIT 1",
          [`performance-${size}@second-brain.local`],
        );
        const userId = userResult.rows[0]?.id;
        if (!userId) {
          (report.datasets as Record<string, unknown>)[String(size)] = {
            skipped: true,
            reason: "Dataset is missing. Run pnpm perf:seed first.",
          };
          continue;
        }

        const from = new Date("2025-04-01T00:00:00.000Z");
        const to = new Date("2025-06-30T23:59:59.999Z");
        const plans = {
          vector: await explain(client, `
            SELECT id, 1 - (embedding <=> $2::vector) AS similarity
            FROM memory_chunks
            WHERE user_id = $1::text AND embedding IS NOT NULL
            ORDER BY embedding <=> $2::vector
            LIMIT 20
          `, [userId, queryVector]),
          lexical: await explain(client, `
            SELECT id,
              ts_rank_cd(
                search_document,
                plainto_tsquery('simple', $2)
              ) AS rank
            FROM memory_chunks
            WHERE user_id = $1::text
              AND search_document @@ plainto_tsquery('simple', $2)
            ORDER BY rank DESC, occurred_at DESC
            LIMIT 20
          `, [userId, "retrieval latency"]),
          dateRange: await explain(client, `
            SELECT id, source_type, source_id, occurred_at
            FROM memory_chunks
            WHERE user_id = $1::text
              AND occurred_at >= $2
              AND occurred_at <= $3
            ORDER BY occurred_at DESC
            LIMIT 50
          `, [userId, from, to]),
          entity: await explain(client, `
            SELECT mc.id, mc.source_type, mc.occurred_at
            FROM entity_mentions em
            JOIN memory_chunks mc ON mc.id = em.chunk_id
            WHERE mc.user_id = $1::text
              AND em.entity_type = 'person'
              AND em.entity_value_normalized = 'linh nguyen'
            ORDER BY mc.occurred_at DESC
            LIMIT 50
          `, [userId]),
        };
        (report.datasets as Record<string, unknown>)[String(size)] = {
          userId,
          plans,
        };
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const output = resolve(
    process.env.PERF_EXPLAIN_OUTPUT ??
      `.artifacts/performance/explain-${Date.now()}.json`,
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`EXPLAIN ANALYZE report written to ${output}`);
  console.log(JSON.stringify(compactReport(report), null, 2));
}

async function explain(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: any[] }> },
  sql: string,
  values: unknown[],
) {
  const result = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) ${sql}`,
    values,
  );
  const root = result.rows[0]?.["QUERY PLAN"]?.[0] as ExplainPlan | undefined;
  if (!root) throw new Error("PostgreSQL returned an invalid EXPLAIN plan.");
  return {
    planningMs: root["Planning Time"],
    executionMs: root["Execution Time"],
    actualRows: root.Plan["Actual Rows"],
    nodeTypes: collectNodeTypes(root.Plan),
    sharedHitBlocks: sumPlanValue(root.Plan, "Shared Hit Blocks"),
    sharedReadBlocks: sumPlanValue(root.Plan, "Shared Read Blocks"),
    plan: root,
  };
}

function collectNodeTypes(plan: Record<string, unknown>, result: string[] = []) {
  if (typeof plan["Node Type"] === "string") result.push(plan["Node Type"]);
  for (const child of (plan.Plans as Record<string, unknown>[] | undefined) ?? []) {
    collectNodeTypes(child, result);
  }
  return result;
}

function sumPlanValue(plan: Record<string, unknown>, key: string): number {
  const own = typeof plan[key] === "number" ? plan[key] : 0;
  return own + ((plan.Plans as Record<string, unknown>[] | undefined) ?? [])
    .reduce((total, child) => total + sumPlanValue(child, key), 0);
}

function compactReport(report: Record<string, unknown>) {
  const datasets = report.datasets as Record<string, any>;
  return Object.fromEntries(
    Object.entries(datasets).map(([size, dataset]) => [
      size,
      dataset.skipped
        ? dataset
        : Object.fromEntries(
            Object.entries(dataset.plans).map(([name, value]: [string, any]) => [
              name,
              {
                executionMs: value.executionMs,
                nodeTypes: value.nodeTypes,
                sharedReadBlocks: value.sharedReadBlocks,
              },
            ]),
          ),
    ]),
  );
}

function buildVector(seed: number) {
  const values = Array.from({ length: 768 }, (_, index) =>
    Math.sin((seed + 1) * (index + 3) * 0.017) +
    Math.cos((seed + 7) * (index + 1) * 0.011),
  );
  const norm = Math.hypot(...values) || 1;
  return `[${values.map((value) => (value / norm).toFixed(7)).join(",")}]`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
