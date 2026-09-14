export type PerformanceMetricLabels = Record<string, string | number | boolean>;

export type PerformanceMetricSummary = {
  name: string;
  labels: Record<string, string>;
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

const DEFAULT_SAMPLE_LIMIT = 2_048;
const series = new Map<
  string,
  { name: string; labels: Record<string, string>; samples: number[] }
>();

export function recordPerformanceMetric(
  name: string,
  durationMs: number,
  labels: PerformanceMetricLabels = {},
) {
  if (!name || !Number.isFinite(durationMs) || durationMs < 0) return;
  const normalizedLabels = Object.fromEntries(
    Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );
  const key = `${name}:${JSON.stringify(normalizedLabels)}`;
  const metric = series.get(key) ?? {
    name,
    labels: normalizedLabels,
    samples: [],
  };
  metric.samples.push(durationMs);
  const limit = getSampleLimit();
  if (metric.samples.length > limit) {
    metric.samples.splice(0, metric.samples.length - limit);
  }
  series.set(key, metric);
}

export function getPerformanceMetricsSnapshot() {
  return {
    capturedAt: new Date().toISOString(),
    sampleLimit: getSampleLimit(),
    metrics: Array.from(series.values())
      .map<PerformanceMetricSummary>(({ name, labels, samples }) => {
        const sorted = [...samples].sort((left, right) => left - right);
        return {
          name,
          labels,
          count: samples.length,
          p50Ms: round(percentile(sorted, 0.5)),
          p95Ms: round(percentile(sorted, 0.95)),
          p99Ms: round(percentile(sorted, 0.99)),
          minMs: round(sorted[0] ?? 0),
          maxMs: round(sorted.at(-1) ?? 0),
          lastMs: round(samples.at(-1) ?? 0),
        };
      })
      .sort((left, right) =>
        `${left.name}:${JSON.stringify(left.labels)}`.localeCompare(
          `${right.name}:${JSON.stringify(right.labels)}`,
        ),
      ),
  };
}

export function resetPerformanceMetrics() {
  series.clear();
}

function percentile(sorted: number[], quantile: number) {
  if (!sorted.length) return 0;
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index] ?? 0;
}

function getSampleLimit() {
  const configured = Number(
    process.env.PERFORMANCE_METRIC_SAMPLE_LIMIT ?? DEFAULT_SAMPLE_LIMIT,
  );
  if (!Number.isFinite(configured)) return DEFAULT_SAMPLE_LIMIT;
  return Math.min(Math.max(Math.trunc(configured), 100), 20_000);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
