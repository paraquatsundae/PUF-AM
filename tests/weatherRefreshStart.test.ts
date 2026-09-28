import { describe, expect, it } from 'vitest';
import { refreshFetchStart } from '../shared/weather/dpirdClient';

describe('refreshFetchStart', () => {
  it('keeps the rolling window when the cache is already inside it', () => {
    expect(refreshFetchStart('2026-09-20', '2026-09-14')).toBe('2026-09-14');
    expect(refreshFetchStart(null, '2026-09-14')).toBe('2026-09-14');
  });

  it('starts at the last cached day when the cache is older than the window', () => {
    expect(refreshFetchStart('2026-09-09', '2026-09-14')).toBe('2026-09-09');
  });
});
