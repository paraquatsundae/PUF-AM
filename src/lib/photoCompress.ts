/**
 * Shared farm-photo compressor — Freenet PUT and Firebase Storage use the same
 * resize / quality / hard-cap. Never upload the original beside the compressed
 * file (`Plans/FIREBASE_BILLING.md`).
 *
 * Decision — 2026-09-14: longest edge 1600 px, JPEG quality 0.72, hard cap
 * 600 KB after compress; reject if still over.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

export const PHOTO_MAX_EDGE_PX = 1600;
export const PHOTO_JPEG_QUALITY = 0.72;
export const PHOTO_MIN_JPEG_QUALITY = 0.4;
export const PHOTO_HARD_CAP_BYTES = 600 * 1024;
export const PHOTO_CONTENT_TYPE = 'image/jpeg';

export class PhotoTooLargeError extends Error {
  readonly code = 'photo-too-large';
  readonly bytes: number;
  readonly cap: number;

  constructor(bytes: number, cap: number = PHOTO_HARD_CAP_BYTES) {
    super(
      `This photo is still ${Math.round(bytes / 1024)} KB after shrinking — the limit is ${Math.round(cap / 1024)} KB. Take a closer crop or a smaller picture.`,
    );
    this.name = 'PhotoTooLargeError';
    this.bytes = bytes;
    this.cap = cap;
  }
}

export type CompressedFarmPhoto = {
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
  contentType: typeof PHOTO_CONTENT_TYPE;
};

export type PhotoBitmapLike = {
  width: number;
  height: number;
  close?: () => void;
};

export type PhotoEncodeFn = (input: {
  bitmap: PhotoBitmapLike;
  width: number;
  height: number;
  quality: number;
}) => Promise<Blob>;

export type CompressFarmPhotoOpts = {
  maxEdge?: number;
  quality?: number;
  minQuality?: number;
  hardCapBytes?: number;
  createBitmap?: (source: Blob) => Promise<PhotoBitmapLike>;
  encode?: PhotoEncodeFn;
};

export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE_PX,
): { width: number; height: number; scale: number } {
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

export function isOverPhotoHardCap(
  bytes: number,
  cap: number = PHOTO_HARD_CAP_BYTES,
): boolean {
  return bytes > cap;
}

export function assertPhotoWithinCap(
  bytes: number,
  cap: number = PHOTO_HARD_CAP_BYTES,
): void {
  if (isOverPhotoHardCap(bytes, cap)) throw new PhotoTooLargeError(bytes, cap);
}

async function defaultCreateBitmap(source: Blob): Promise<PhotoBitmapLike> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Cannot read this photo on this device (no image decoder).');
  }
  return createImageBitmap(source);
}

async function defaultEncode(input: {
  bitmap: PhotoBitmapLike;
  width: number;
  height: number;
  quality: number;
}): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('Cannot compress this photo on this device (no canvas).');
  }
  const canvas = document.createElement('canvas');
  canvas.width = input.width;
  canvas.height = input.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot compress this photo on this device (no canvas).');
  ctx.drawImage(input.bitmap as CanvasImageSource, 0, 0, input.width, input.height);
  const dataUrl = canvas.toDataURL(PHOTO_CONTENT_TYPE, input.quality);
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Resize + JPEG-encode a captured photo. Throws PhotoTooLargeError when the
 * result still exceeds the hard cap after quality and a second shrink.
 */
export async function compressFarmPhoto(
  source: Blob,
  opts?: CompressFarmPhotoOpts,
): Promise<CompressedFarmPhoto> {
  const maxEdge = opts?.maxEdge ?? PHOTO_MAX_EDGE_PX;
  const hardCap = opts?.hardCapBytes ?? PHOTO_HARD_CAP_BYTES;
  const minQuality = opts?.minQuality ?? PHOTO_MIN_JPEG_QUALITY;
  const createBitmap = opts?.createBitmap ?? defaultCreateBitmap;
  const encode = opts?.encode ?? defaultEncode;

  const bitmap = await createBitmap(source);
  try {
    let { width, height } = scaleToMaxEdge(bitmap.width, bitmap.height, maxEdge);
    let quality = opts?.quality ?? PHOTO_JPEG_QUALITY;
    let blob = await encode({ bitmap, width, height, quality });

    while (blob.size > hardCap && quality > minQuality + 0.01) {
      quality = Math.max(minQuality, quality - 0.08);
      blob = await encode({ bitmap, width, height, quality });
    }

    if (blob.size > hardCap) {
      const again = scaleToMaxEdge(width, height, Math.round(maxEdge * 0.7));
      width = again.width;
      height = again.height;
      blob = await encode({ bitmap, width, height, quality: minQuality });
    }

    assertPhotoWithinCap(blob.size, hardCap);
    return {
      blob,
      bytes: blob.size,
      width,
      height,
      contentType: PHOTO_CONTENT_TYPE,
    };
  } finally {
    bitmap.close?.();
  }
}
