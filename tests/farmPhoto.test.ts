import { describe, expect, it } from 'vitest';
import {
  LEGACY_PHOTO_ID,
  MAX_PHOTOS_PER_RECORD,
  TooManyPhotosError,
  assertCanAddPhoto,
  exportPhotoZipName,
  farmPhotoCacheId,
  hostedPhotoStoragePath,
  nextFarmPhotoId,
  photosForFirestore,
  upsertPhotoRef,
} from '../src/lib/farmPhoto';
import { eventPhotoStoragePath as outboxEventPath, photoStoragePath } from '../src/lib/photoOutbox';

describe('farm photo convention', () => {
  it('keeps photo.jpg as the first/legacy hosted path', () => {
    expect(hostedPhotoStoragePath('issue', 'farm1', 'issue9')).toBe(
      'farms/farm1/issues/issue9/photo.jpg',
    );
    expect(photoStoragePath('farm1', 'issue9')).toBe('farms/farm1/issues/issue9/photo.jpg');
    expect(nextFarmPhotoId([])).toBe(LEGACY_PHOTO_ID);
  });

  it('adds extra issue photos under the same folder with an opaque id', () => {
    const second = nextFarmPhotoId([{ id: LEGACY_PHOTO_ID }]);
    expect(second).not.toBe(LEGACY_PHOTO_ID);
    expect(second.startsWith('p')).toBe(true);
    expect(hostedPhotoStoragePath('issue', 'farm1', 'issue9', second)).toBe(
      `farms/farm1/issues/issue9/${second}.jpg`,
    );
  });

  it('wires diary photos under events, never the word diary', () => {
    expect(hostedPhotoStoragePath('event', 'farm1', 'evt9', 'pabc')).toBe(
      'farms/farm1/events/evt9/pabc.jpg',
    );
    expect(outboxEventPath('farm1', 'evt9', 'pabc')).toBe('farms/farm1/events/evt9/pabc.jpg');
    expect(exportPhotoZipName('evt9', 'pabc')).toBe('photos/evt9_pabc.jpg');
    expect(exportPhotoZipName('issue9', 'photo')).toBe('photos/issue9_photo.jpg');
  });

  it('caps at 5 and keeps who/where/when off the file name', () => {
    expect(MAX_PHOTOS_PER_RECORD).toBe(5);
    expect(() => assertCanAddPhoto(5)).toThrow(TooManyPhotosError);
    expect(exportPhotoZipName('issue9', 'photo')).not.toMatch(/paddock|north|jane/i);
    expect(farmPhotoCacheId('event', 'farm1', 'evt9', 'p1')).toBe('farm1:event:evt9:p1');
  });

  it('strips Freenet-only fields before Firestore', () => {
    const cleaned = photosForFirestore([
      {
        id: 'photo',
        createdAt: '2026-09-14T00:00:00.000Z',
        createdBy: 'uid1',
        blockId: 'b1',
        url: 'https://example.test/photo.jpg',
        hash: 'ab'.repeat(32),
        freenetUri: 'FN02@x',
        status: 'ready',
        error: 'nope',
      },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned?.[0]).not.toHaveProperty('hash');
    expect(cleaned?.[0]).not.toHaveProperty('freenetUri');
    expect(cleaned?.[0]).not.toHaveProperty('status');
    expect(cleaned?.[0]?.blockId).toBe('b1');
  });

  it('upserts by photo id so a record can hold many', () => {
    const first = upsertPhotoRef([], {
      id: 'photo',
      createdAt: '2026-09-14T00:00:00.000Z',
      createdBy: 'uid1',
    });
    const two = upsertPhotoRef(first, {
      id: 'p2',
      createdAt: '2026-09-14T00:01:00.000Z',
      createdBy: 'uid1',
    });
    expect(two).toHaveLength(2);
    expect(upsertPhotoRef(two, { ...two[0]!, url: 'https://x' })).toHaveLength(2);
  });
});
