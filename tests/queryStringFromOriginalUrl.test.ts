import { describe, expect, it } from 'vitest';
import { queryStringFromOriginalUrl } from '../shared/weather/queryStringFromOriginalUrl';

describe('queryStringFromOriginalUrl', () => {
  it('returns empty when there is no query', () => {
    expect(queryStringFromOriginalUrl('/api/weather/dpird/stations')).toBe('');
  });

  it('keeps repeated keys that req.query would collapse', () => {
    expect(
      queryStringFromOriginalUrl(
        '/api/weather/dpird/stations/summaries/hourly?stationCode=MA002&limit=100&limit=100'
      )
    ).toBe('stationCode=MA002&limit=100&limit=100');
  });

  it('does not invent a leading question mark', () => {
    expect(queryStringFromOriginalUrl('/x?a=1')).toBe('a=1');
  });
});
