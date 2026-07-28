import { describe, expect, it } from 'vitest';
import {
  estimateDataUrlBytes,
  MAX_PHOTO_DATA_BYTES,
  photoOutboxId,
  photoStoragePath,
} from '../src/lib/photoOutbox';
import { weatherIdbKey } from '../src/lib/weatherCacheIdb';

describe('photoOutbox helpers', () => {
  it('builds stable storage paths and ids', () => {
    expect(photoStoragePath('farm1', 'issue9')).toBe('farms/farm1/issues/issue9/photo.jpg');
    expect(photoOutboxId('farm1', 'issue9')).toBe('farm1:issue9');
  });

  it('estimates data-URL byte size under the Firestore headroom cap', () => {
    const tiny = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    expect(estimateDataUrlBytes(tiny)).toBeLessThan(MAX_PHOTO_DATA_BYTES);
    expect(MAX_PHOTO_DATA_BYTES).toBeLessThan(1_000_000);
  });
});

describe('weatherCacheIdb helpers', () => {
  it('normalizes station keys', () => {
    expect(weatherIdbKey('ma002')).toBe('MA002');
  });
});
