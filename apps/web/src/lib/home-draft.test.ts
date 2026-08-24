import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHomeDraft } from './home-draft.ts';

test('buildHomeDraft stores the browser-local calendar date', () => {
  const localNow = new Date(2026, 7, 24, 0, 30);

  assert.equal(buildHomeDraft('A memory', localNow).entryDate, '2026-08-24');
});
