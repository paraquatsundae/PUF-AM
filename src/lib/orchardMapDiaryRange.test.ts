import { describe, expect, it } from 'vitest';
import { orchardMapDiaryDateRange } from './orchardMapDiaryRange';

describe('orchardMapDiaryDateRange', () => {
  it('covers the past three months and one month ahead', () => {
    const range = orchardMapDiaryDateRange(new Date('2026-08-28T12:00:00.000Z'));
    expect(range.start).toBe('2026-05-28');
    expect(range.end).toBe('2026-09-28');
  });
});
