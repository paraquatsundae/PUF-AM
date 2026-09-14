import { describe, expect, it } from 'vitest';
import {
  assertNoFarmSeedInPhotoValue,
  packIssuePhotoBlob,
  parseIssuePhotoBlob,
  parsePhotoIndex,
  upsertPhotoIndexEntry,
} from '../src/mist/photoPayload';

describe('issue photo Freenet payload', () => {
  it('packs and parses JPEG bytes without FarmSeed', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const packed = packIssuePhotoBlob(
      {
        v: 1,
        kind: 'issue-photo',
        farmId: 'farm-1',
        issueId: 'issue-9',
        photoId: 'photo',
        contentType: 'image/jpeg',
        width: 1600,
        height: 1200,
        bytes: jpeg.byteLength,
      },
      jpeg,
    );
    const text = new TextDecoder().decode(packed);
    expect(text).not.toMatch(/farmSeed/i);
    expect(text).not.toMatch(/FarmCode/);
    const opened = parseIssuePhotoBlob(packed);
    expect(opened.meta.issueId).toBe('issue-9');
    expect(Array.from(opened.jpeg)).toEqual([0xff, 0xd8, 0xff, 0xd9]);
  });

  it('refuses a photo index that carries FarmSeed', () => {
    expect(() =>
      assertNoFarmSeedInPhotoValue({
        v: 1,
        kind: 'photo-index',
        farmId: 'farm-1',
        farmSeedHex: 'aa'.repeat(32),
      }),
    ).toThrow(/FarmSeed/);
    expect(() =>
      parsePhotoIndex({
        v: 1,
        kind: 'photo-index',
        farmId: 'farm-1',
        updatedAt: '2026-09-14T00:00:00.000Z',
        photos: [],
        farmCode: 'secret',
      }),
    ).toThrow(/FarmSeed/);
  });

  it('upserts one entry per issue+photo and keeps the pack FarmSeed-free', () => {
    const entry = {
      kind: 'issue' as const,
      recordId: 'issue-9',
      photoId: 'photo',
      issueId: 'issue-9',
      uri: 'FN02@photo',
      contentHash: 'ab'.repeat(32),
      bytes: 40_000,
      width: 1600,
      height: 1200,
      contentType: 'image/jpeg',
      updatedAt: '2026-09-14T00:00:00.000Z',
    };
    const index = upsertPhotoIndexEntry(null, 'farm-1', entry);
    expect(index.photos).toHaveLength(1);
    expect(JSON.stringify(index)).not.toMatch(/farmSeed/i);
    const again = upsertPhotoIndexEntry(index, 'farm-1', { ...entry, uri: 'FN02@photo2' });
    expect(again.photos).toHaveLength(1);
    expect(again.photos[0]?.uri).toBe('FN02@photo2');
    const second = upsertPhotoIndexEntry(again, 'farm-1', {
      ...entry,
      photoId: 'p2',
      uri: 'FN02@p2',
    });
    expect(second.photos).toHaveLength(2);
  });

  it('accepts a legacy issue-only index row as photo.jpg', () => {
    const index = parsePhotoIndex({
      v: 1,
      kind: 'photo-index',
      farmId: 'farm-1',
      updatedAt: '2026-09-14T00:00:00.000Z',
      photos: [
        {
          issueId: 'issue-9',
          uri: 'FN02@legacy',
          contentHash: 'ab'.repeat(32),
        },
      ],
    });
    expect(index.photos[0]?.kind).toBe('issue');
    expect(index.photos[0]?.photoId).toBe('photo');
    expect(index.photos[0]?.recordId).toBe('issue-9');
  });

  it('indexes an event photo without breaking issue slots', () => {
    const issue = upsertPhotoIndexEntry(null, 'farm-1', {
      kind: 'issue',
      recordId: 'issue-9',
      photoId: 'photo',
      uri: 'FN02@issue',
      contentHash: 'ab'.repeat(32),
      bytes: 1,
      width: 1,
      height: 1,
      contentType: 'image/jpeg',
      updatedAt: '2026-09-14T00:00:00.000Z',
    });
    const both = upsertPhotoIndexEntry(issue, 'farm-1', {
      kind: 'event',
      recordId: 'evt-1',
      photoId: 'p2',
      eventId: 'evt-1',
      uri: 'FN02@event',
      contentHash: 'cd'.repeat(32),
      bytes: 1,
      width: 1,
      height: 1,
      contentType: 'image/jpeg',
      updatedAt: '2026-09-14T00:01:00.000Z',
    });
    expect(both.photos).toHaveLength(2);
    expect(both.photos.some((row) => row.kind === 'event' && row.recordId === 'evt-1')).toBe(true);
  });
});
