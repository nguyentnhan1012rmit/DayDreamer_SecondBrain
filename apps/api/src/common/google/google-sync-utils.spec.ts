import { contentHash, mapWithConcurrency, readSyncCursor } from './google-sync-utils';

describe('Google sync utilities', () => {
  it('preserves result order and caps active Google requests', async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    }, 2);

    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(maximumActive).toBe(2);
  });

  it('creates stable content hashes and safely reads cursors', () => {
    expect(contentHash({ id: '1', value: 'same' })).toBe(contentHash({ id: '1', value: 'same' }));
    expect(contentHash({ id: '1', value: 'same' })).not.toBe(contentHash({ id: '1', value: 'changed' }));
    expect(readSyncCursor<{ historyId: string }>({ historyId: '42' })).toEqual({ historyId: '42' });
    expect(readSyncCursor(null)).toEqual({});
  });
});
