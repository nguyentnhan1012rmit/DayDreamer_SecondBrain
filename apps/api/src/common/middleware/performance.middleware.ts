import type { NextFunction, Request, Response } from 'express';
import { recordPerformanceMetric } from '../performance/performance-metrics';

export function performanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = performance.now();
  res.once('finish', () => {
    recordPerformanceMetric(
      'http.request',
      performance.now() - startedAt,
      {
        method: req.method,
        route: normalizeRoute(req.baseUrl || req.originalUrl || req.url),
        status: `${Math.floor(res.statusCode / 100)}xx`,
      },
    );
  });
  next();
}

export function normalizeRoute(value: string) {
  const path = value.split('?')[0] || '/';
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/giu,
      '/:id',
    )
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id');
}
