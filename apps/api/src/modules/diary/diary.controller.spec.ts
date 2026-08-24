import {
  DiaryController,
  MAX_DIARY_ENTRIES_PER_REQUEST,
  parseDiaryLimit,
} from './diary.controller';
import { UpdateDiaryDto } from './dto/update-diary.dto';

describe('DiaryController yearly entry limit', () => {
  it('allows a request large enough for a complete yearly view', () => {
    expect(parseDiaryLimit('366')).toBe(366);
    expect(MAX_DIARY_ENTRIES_PER_REQUEST).toBeGreaterThanOrEqual(366);
  });

  it('clamps invalid and excessive limits safely', () => {
    expect(parseDiaryLimit('0')).toBe(1);
    expect(parseDiaryLimit('9999')).toBe(MAX_DIARY_ENTRIES_PER_REQUEST);
    expect(parseDiaryLimit('not-a-number')).toBeUndefined();
    expect(parseDiaryLimit()).toBeUndefined();
  });

  it('preserves UpdateDiaryDto runtime metadata for global validation', () => {
    const parameterTypes: unknown = Reflect.getMetadata(
      'design:paramtypes',
      DiaryController.prototype,
      'update',
    );
    if (!Array.isArray(parameterTypes)) {
      throw new Error('DiaryController update metadata is missing.');
    }
    const updateBodyType: unknown = parameterTypes[2];

    expect(updateBodyType).toBe(UpdateDiaryDto);
  });
});
