import {
  getPerformanceMetricsSnapshot,
  recordPerformanceMetric,
  resetPerformanceMetrics,
} from './performance-metrics';

describe('performance metrics', () => {
  beforeEach(() => resetPerformanceMetrics());

  it('calculates rolling p50, p95 and p99 by metric labels', () => {
    for (let value = 1; value <= 100; value += 1) {
      recordPerformanceMetric('http.request', value, {
        method: 'GET',
        route: '/api/diary',
      });
    }

    expect(getPerformanceMetricsSnapshot().metrics[0]).toMatchObject({
      name: 'http.request',
      count: 100,
      p50Ms: 50,
      p95Ms: 95,
      p99Ms: 99,
      minMs: 1,
      maxMs: 100,
    });
  });

  it('keeps cold and warm embedding samples separate', () => {
    recordPerformanceMetric('search.embedding', 120, { cache: 'cold' });
    recordPerformanceMetric('search.embedding', 3, { cache: 'warm' });

    const metrics = getPerformanceMetricsSnapshot().metrics;
    expect(metrics).toHaveLength(2);
    expect(metrics.map((metric) => metric.labels.cache).sort()).toEqual([
      'cold',
      'warm',
    ]);
  });
});
