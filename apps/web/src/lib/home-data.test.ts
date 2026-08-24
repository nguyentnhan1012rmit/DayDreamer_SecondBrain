import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadHomeData } from './home-data.ts';

test('loadHomeData keeps diary entries when summaries fail', async () => {
  const entries = [{ id: 'diary-1' }];
  const result = await loadHomeData({
    loadEntries: async () => entries,
    loadSummaries: async () => {
      throw new Error('Summary unavailable');
    },
  });

  assert.deepEqual(result.entries, entries);
  assert.deepEqual(result.summaries, []);
});

test('loadHomeData keeps summaries when diary loading fails', async () => {
  const summaries = [{ id: 'summary-1' }];
  const result = await loadHomeData({
    loadEntries: async () => {
      throw new Error('Diary unavailable');
    },
    loadSummaries: async () => summaries,
  });

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.summaries, summaries);
});

test('loadHomeData isolates a synchronous loader failure', async () => {
  const summaries = [{ id: 'summary-1' }];
  const result = await loadHomeData({
    loadEntries: () => {
      throw new Error('Diary loader failed before returning a promise');
    },
    loadSummaries: async () => summaries,
  });

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.summaries, summaries);
});
