/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueEventPhoto = vi.fn<(farmId: string, eventId: string, blob: Blob, photoId: string) => Promise<void>>(
  async () => undefined,
);
const flushPhotoOutbox = vi.fn<(farmId?: string) => Promise<{ flushed: number; failed: number }>>(
  async () => ({ flushed: 1, failed: 0 }),
);
const publishEventPhotoToFreenet = vi.fn<(input: unknown) => Promise<unknown>>(async () => ({
  uri: 'FN02@event',
  contentHash: 'ab'.repeat(32),
  indexHash: 'cd'.repeat(32),
}));
const putIssuePhotoCache = vi.fn<(row: unknown) => Promise<void>>(async () => undefined);
const updateEvent = vi.fn<
  (
    farmId: string,
    canEdit: boolean,
    id: string,
    updates: Record<string, unknown>,
    opts?: { queueCloud?: boolean; publishHot?: boolean },
  ) => Promise<void>
>(async () => undefined);
const usesCloudSyncOutbox = vi.fn(() => true);
const isFreenetFarm = vi.fn(() => false);

vi.mock('../src/lib/photoOutbox', () => ({
  enqueueEventPhoto: (farmId: string, eventId: string, blob: Blob, photoId: string) =>
    enqueueEventPhoto(farmId, eventId, blob, photoId),
}));
vi.mock('../src/lib/flushPhotoOutbox', () => ({
  flushPhotoOutbox: (farmId?: string) => flushPhotoOutbox(farmId),
}));
vi.mock('../src/mist/mistPhotoFreenet', () => ({
  publishEventPhotoToFreenet: (input: unknown) => publishEventPhotoToFreenet(input),
}));
vi.mock('../src/lib/issuePhotoCache', () => ({
  putIssuePhotoCache: (row: unknown) => putIssuePhotoCache(row),
  deleteFarmPhotoCache: async () => undefined,
}));
vi.mock('../src/lib/farmDiaryStore', () => ({
  useFarmDiaryStore: {
    getState: () => ({
      updateEvent,
      events: [
        {
          id: 'evt-1',
          date: '2026-09-14',
          type: 'work',
          title: 'Check drip',
          assignedToName: 'Sam',
          blockId: 'block-a',
        },
      ],
    }),
  },
}));
vi.mock('../src/lib/farmPipes', () => ({
  usesCloudSyncOutbox: () => usesCloudSyncOutbox(),
  isFreenetFarm: () => isFreenetFarm(),
}));
vi.mock('../src/lib/photoCompress', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/photoCompress')>(
    '../src/lib/photoCompress',
  );
  return {
    ...actual,
    compressFarmPhoto: async (source: Blob) => ({
      blob: new Blob([new Uint8Array(40_000)], { type: 'image/jpeg' }),
      bytes: 40_000,
      width: 1600,
      height: 1200,
      contentType: 'image/jpeg' as const,
      sourceSize: source.size,
    }),
  };
});

import { attachEventPhoto } from '../src/lib/attachEventPhoto';

const ORIGINAL = new Blob([new Uint8Array(2_000_000)], { type: 'image/jpeg' });

describe('attachEventPhoto', () => {
  beforeEach(() => {
    enqueueEventPhoto.mockClear();
    flushPhotoOutbox.mockClear();
    publishEventPhotoToFreenet.mockClear();
    putIssuePhotoCache.mockClear();
    updateEvent.mockClear();
    usesCloudSyncOutbox.mockReturnValue(true);
    isFreenetFarm.mockReturnValue(false);
  });

  it('enqueues a compressed JPEG on the hosted events path', async () => {
    const result = await attachEventPhoto('farm-1', 'evt-1', ORIGINAL, { createdBy: 'uid-1' });
    expect(result.pipe).toBe('cloud');
    expect(result.photoId).toBe('photo');
    expect(enqueueEventPhoto).toHaveBeenCalledOnce();
    expect(publishEventPhotoToFreenet).not.toHaveBeenCalled();
    const firstCall = updateEvent.mock.calls[0];
    const photos = (firstCall?.[3] as { photos?: { blockId?: string; directedAtName?: string }[] }).photos;
    expect(photos?.[0]?.blockId).toBe('block-a');
    expect(photos?.[0]?.directedAtName).toBe('Sam');
  });

  it('PUTs Freenet event slots without Storage', async () => {
    usesCloudSyncOutbox.mockReturnValue(false);
    isFreenetFarm.mockReturnValue(true);
    const result = await attachEventPhoto('farm-1', 'evt-1', ORIGINAL, { createdBy: 'uid-1' });
    expect(result.pipe).toBe('freenet');
    expect(enqueueEventPhoto).not.toHaveBeenCalled();
    expect(publishEventPhotoToFreenet).toHaveBeenCalledOnce();
    expect(updateEvent.mock.calls.some((call) => call[4]?.publishHot === false)).toBe(true);
  });
});
