import { createHash } from 'node:crypto';

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency = googleRequestConcurrency(),
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, worker),
  );
  return results;
}

export function googleRequestConcurrency() {
  const value = Number(process.env.GOOGLE_API_CONCURRENCY ?? 4);
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1), 16) : 4;
}

export function contentHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function readSyncCursor<T extends Record<string, unknown>>(
  cursor: unknown,
): Partial<T> {
  return cursor && typeof cursor === 'object' && !Array.isArray(cursor)
    ? (cursor as Partial<T>)
    : {};
}
