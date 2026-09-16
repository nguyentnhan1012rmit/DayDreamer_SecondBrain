# Performance benchmark

The benchmark tools use a dedicated PostgreSQL database. Never point
`PERF_DATABASE_URL` at production unless `PERF_ALLOW_REMOTE=true` is set
deliberately.

## Dataset and query plans

```bash
PERF_DATABASE_URL=postgresql://... pnpm perf:seed
PERF_DATABASE_URL=postgresql://... pnpm perf:explain
```

`perf:seed` creates isolated users with 365, 1,000, and 10,000 diary records.
The records include attachment sources, calendar-to-diary links, 768-dimension
vectors, and entity mentions backed by real foreign keys. `perf:explain` writes
the complete vector, lexical, date-range, and entity `EXPLAIN ANALYZE` plans to
`.artifacts/performance/`.

## HTTP latency

Start the API against the benchmark database, then run:

```bash
PERF_API_URL=http://localhost:3001 \
PERF_ACCESS_TOKEN_FILE=/path/to/token \
PERF_ITERATIONS=30 \
pnpm perf:http
```

`PERF_ACCESS_TOKEN` can be used instead of a token file. Use
`PERF_MODES=cold,warm,exactDate` to select phases. The JSON report contains
p50/p95/p99 for response headers, first byte, full HTTP response, embedding,
retrieval, reranking, first result, and full answer.

The API also exposes accumulated server measurements in the admin diagnostics
response. Search responses include the same stages in `Server-Timing` and in
`analytics.timing`.

## Yearly activity view

The timeline mounts the real `YearlyActivityView`. In a browser console, read
its rolling render, interaction, and network percentiles with:

```js
window.__SECOND_BRAIN_PERFORMANCE__()
```

Samples are bounded in memory and report p50/p95/p99 for `yearly.render`,
`yearly.interaction`, and `yearly.network`.
