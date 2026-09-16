export type ClientPerformanceSummary = {
  name: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  lastMs: number;
};

const MAX_SAMPLES = 512;
const samples = new Map<string, number[]>();

export function recordClientPerformance(name: string, durationMs: number) {
  if (!name || !Number.isFinite(durationMs) || durationMs < 0) return;
  const values = samples.get(name) ?? [];
  values.push(durationMs);
  if (values.length > MAX_SAMPLES) values.splice(0, values.length - MAX_SAMPLES);
  samples.set(name, values);
  if (typeof performance !== "undefined") {
    performance.mark(`${name}:sample`, { detail: { durationMs } });
  }
}

export function getClientPerformanceSnapshot(): ClientPerformanceSummary[] {
  return Array.from(samples.entries())
    .map(([name, values]) => {
      const sorted = [...values].sort((left, right) => left - right);
      return {
        name,
        count: values.length,
        p50Ms: round(percentile(sorted, 0.5)),
        p95Ms: round(percentile(sorted, 0.95)),
        p99Ms: round(percentile(sorted, 0.99)),
        maxMs: round(sorted.at(-1) ?? 0),
        lastMs: round(values.at(-1) ?? 0),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function resetClientPerformance() {
  samples.clear();
}

if (typeof window !== "undefined") {
  Object.assign(window, {
    __SECOND_BRAIN_PERFORMANCE__: getClientPerformanceSnapshot,
  });
}

function percentile(sorted: number[], quantile: number) {
  if (!sorted.length) return 0;
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
