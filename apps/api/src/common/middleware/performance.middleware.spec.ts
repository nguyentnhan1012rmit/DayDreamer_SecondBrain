import { normalizeRoute } from './performance.middleware';

describe('performance middleware', () => {
  it('removes query strings and normalizes ids', () => {
    expect(normalizeRoute('/api/diary/42?include=true')).toBe(
      '/api/diary/:id',
    );
    expect(
      normalizeRoute(
        '/api/diary/123e4567-e89b-12d3-a456-426614174000',
      ),
    ).toBe('/api/diary/:id');
  });
});
