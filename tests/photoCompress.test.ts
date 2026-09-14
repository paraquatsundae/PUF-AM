import { describe, expect, it } from 'vitest';
import {
  PHOTO_HARD_CAP_BYTES,
  PHOTO_MAX_EDGE_PX,
  PhotoTooLargeError,
  assertPhotoWithinCap,
  compressFarmPhoto,
  isOverPhotoHardCap,
  scaleToMaxEdge,
} from '../src/lib/photoCompress';

describe('photoCompress', () => {
  it('scales the longest edge to 1600 px and leaves a smaller image alone', () => {
    expect(scaleToMaxEdge(4000, 3000)).toEqual({
      width: 1600,
      height: 1200,
      scale: 1600 / 4000,
    });
    expect(scaleToMaxEdge(800, 600).scale).toBe(1);
    expect(PHOTO_MAX_EDGE_PX).toBe(1600);
  });

  it('rejects a result over the 600 KB hard cap', () => {
    expect(PHOTO_HARD_CAP_BYTES).toBe(600 * 1024);
    expect(isOverPhotoHardCap(PHOTO_HARD_CAP_BYTES)).toBe(false);
    expect(isOverPhotoHardCap(PHOTO_HARD_CAP_BYTES + 1)).toBe(true);
    expect(() => assertPhotoWithinCap(PHOTO_HARD_CAP_BYTES + 10)).toThrow(PhotoTooLargeError);
  });

  it('compress reduces bytes and stays under the cap', async () => {
    const source = new Blob([new Uint8Array(2_000_000)], { type: 'image/jpeg' });
    const out = await compressFarmPhoto(source, {
      createBitmap: async () => ({ width: 4000, height: 3000, close() {} }),
      encode: async ({ width, quality }) => {
        const n = Math.max(20_000, Math.round(120_000 * quality * (width / 1600)));
        return new Blob([new Uint8Array(n)], { type: 'image/jpeg' });
      },
    });
    expect(out.bytes).toBeLessThan(source.size);
    expect(out.bytes).toBeLessThanOrEqual(PHOTO_HARD_CAP_BYTES);
    expect(out.width).toBe(1600);
    expect(out.contentType).toBe('image/jpeg');
  });

  it('throws when encode cannot get under the hard cap', async () => {
    const source = new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' });
    await expect(
      compressFarmPhoto(source, {
        createBitmap: async () => ({ width: 2000, height: 2000, close() {} }),
        encode: async () => new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' }),
      }),
    ).rejects.toBeInstanceOf(PhotoTooLargeError);
  });
});
