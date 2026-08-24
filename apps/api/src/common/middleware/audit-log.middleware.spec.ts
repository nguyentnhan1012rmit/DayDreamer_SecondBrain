import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auditLogMiddleware, getAuditPath } from './audit-log.middleware';

describe('auditLogMiddleware', () => {
  const originalAuditLogEnabled = process.env.AUDIT_LOG_ENABLED;

  afterEach(() => {
    restoreOptionalEnv('AUDIT_LOG_ENABLED', originalAuditLogEnabled);
    jest.restoreAllMocks();
  });

  it('logs only the request path and excludes sensitive query parameters', () => {
    delete process.env.AUDIT_LOG_ENABLED;
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const finishListeners: Array<() => void> = [];
    const response = {
      statusCode: 200,
      on: jest.fn((event: string, listener: () => void) => {
        if (event === 'finish') finishListeners.push(listener);
        return response;
      }),
    } as unknown as Response;
    const request = {
      method: 'GET',
      path: '/api/search',
      originalUrl: '/api/search?question=my-private-thought&code=oauth-secret',
      url: '/api/search?question=my-private-thought&code=oauth-secret',
      ip: '127.0.0.1',
      header: jest.fn(() => undefined),
    } as unknown as Request;
    const next = jest.fn();

    auditLogMiddleware(request, response, next);
    finishListeners.forEach((listener) => listener());

    expect(next).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      path: string;
    };
    expect(record.path).toBe('/api/search');
    expect(JSON.stringify(record)).not.toContain('my-private-thought');
    expect(JSON.stringify(record)).not.toContain('oauth-secret');
  });

  it('strips a query string when Express path metadata is unavailable', () => {
    expect(
      getAuditPath({
        path: '',
        originalUrl: '/api/auth/google/callback?code=secret&state=signed',
        url: '',
      }),
    ).toBe('/api/auth/google/callback');
  });
});

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
