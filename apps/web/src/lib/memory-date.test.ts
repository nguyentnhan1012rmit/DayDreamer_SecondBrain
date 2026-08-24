import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveMemoryDate, toLocalDateKey } from './memory-date.ts';

test('resolveMemoryDate prefers the memory entry date', () => {
  const date = resolveMemoryDate({
    entryDate: '2026-08-24',
    createdAt: '2026-09-10T08:00:00.000Z',
  });

  assert.equal(toLocalDateKey(date), '2026-08-24');
});

test('resolveMemoryDate falls back to createdAt for a missing or invalid entry date', () => {
  const missingDate = resolveMemoryDate({
    createdAt: '2026-08-24T08:00:00.000Z',
  });
  const invalidDate = resolveMemoryDate({
    entryDate: '2026-02-31',
    createdAt: '2026-08-24T08:00:00.000Z',
  });

  assert.equal(missingDate.toISOString(), '2026-08-24T08:00:00.000Z');
  assert.equal(invalidDate.toISOString(), '2026-08-24T08:00:00.000Z');
});

test('toLocalDateKey uses local calendar fields', () => {
  const localDate = new Date(2026, 7, 24, 0, 30);

  assert.equal(toLocalDateKey(localDate), '2026-08-24');
});
