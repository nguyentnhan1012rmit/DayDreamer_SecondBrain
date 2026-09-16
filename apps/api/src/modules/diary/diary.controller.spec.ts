import {
  DEFAULT_DIARY_ENTRIES_PER_REQUEST,
  MAX_DIARY_ENTRIES_PER_REQUEST,
  parseDiaryLimit,
} from './diary.controller';

describe('DiaryController cursor page size', () => {
  it('uses a small default page and caps oversized requests', () => {
    expect(parseDiaryLimit()).toBe(DEFAULT_DIARY_ENTRIES_PER_REQUEST);
    expect(DEFAULT_DIARY_ENTRIES_PER_REQUEST).toBe(25);
    expect(parseDiaryLimit('366')).toBe(MAX_DIARY_ENTRIES_PER_REQUEST);
  });

  it('clamps invalid and excessive limits safely', () => {
    expect(parseDiaryLimit('0')).toBe(1);
    expect(parseDiaryLimit('9999')).toBe(MAX_DIARY_ENTRIES_PER_REQUEST);
    expect(parseDiaryLimit('not-a-number')).toBe(
      DEFAULT_DIARY_ENTRIES_PER_REQUEST,
    );
  });
});
