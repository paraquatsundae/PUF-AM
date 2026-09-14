/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueuePhoto = vi.fn<
  (farmId: string, issueId: string, blob: Blob, photoId?: string) => Promise<void>
>(async () => undefined);
const flushPhotoOutbox = vi.fn<(farmId?: string) => Promise<{ flushed: number; failed: number }>>(
  async () => ({ flushed: 1, failed: 0 }),
);
const publishIssuePhotoToFreenet = vi.fn<(input: unknown) => Promise<unknown>>();
const putIssuePhotoCache = vi.fn<(row: unknown) => Promise<void>>(async () => undefined);
const updateIssue = vi.fn<
  (
    farmId: string,
    issueId: string,
    updates: Record<string, unknown>,
    opts?: { queueCloud?: boolean; publishHot?: boolean },
  ) => Promise<void>
>(async () => undefined);
const usesCloudSyncOutbox = vi.fn(() => true);
const isFreenetFarm = vi.fn(() => false);

vi.mock('../src/lib/photoOutbox', () => ({
  enqueuePhoto: (farmId: string, issueId: string, blob: Blob) => enqueuePhoto(farmId, issueId, blob),
}));
vi.mock('../src/lib/flushPhotoOutbox', () => ({
  flushPhotoOutbox: (farmId?: string) => flushPhotoOutbox(farmId),
}));
vi.mock('../src/mist/mistPhotoFreenet', () => ({
  publishIssuePhotoToFreenet: (input: unknown) => publishIssuePhotoToFreenet(input),
}));
vi.mock('../src/lib/issuePhotoCache', () => ({
  issuePhotoCacheId: (farmId: string, issueId: string, photoId = 'photo') =>
    `${farmId}:issue:${issueId}:${photoId}`,
  putIssuePhotoCache: (row: unknown) => putIssuePhotoCache(row),
  deleteFarmPhotoCache: async () => undefined,
}));
vi.mock('../src/lib/fieldStore', () => ({
  useFieldStore: {
    getState: () => ({
      updateIssue,
      issues: [],
      archivedIssues: [],
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
    compressFarmPhoto: async (source: Blob) => {
      const blob = new Blob([new Uint8Array(40_000)], { type: 'image/jpeg' });
      return {
        blob,
        bytes: blob.size,
        width: 1600,
        height: 1200,
        contentType: 'image/jpeg' as const,
        sourceSize: source.size,
      };
    },
  };
});

import { attachIssuePhoto } from '../src/lib/attachIssuePhoto';

const ORIGINAL = new Blob([new Uint8Array(2_000_000)], { type: 'image/jpeg' });

describe('attachIssuePhoto', () => {
  beforeEach(() => {
    enqueuePhoto.mockClear();
    flushPhotoOutbox.mockClear();
    publishIssuePhotoToFreenet.mockClear();
    putIssuePhotoCache.mockClear();
    updateIssue.mockClear();
    usesCloudSyncOutbox.mockReturnValue(true);
    isFreenetFarm.mockReturnValue(false);
  });

  it('enqueues the compressed blob on the hosted path, never the original', async () => {
    const result = await attachIssuePhoto('farm-1', 'issue-1', ORIGINAL, { createdBy: 'uid-1' });
    expect(result.pipe).toBe('cloud');
    expect(result.photoId).toBe('photo');
    expect(enqueuePhoto).toHaveBeenCalledOnce();
    const blob = enqueuePhoto.mock.calls[0]?.[2];
    expect(blob).toBeDefined();
    expect(blob?.size).toBe(40_000);
    expect(blob?.size).toBeLessThan(ORIGINAL.size);
    expect(publishIssuePhotoToFreenet).not.toHaveBeenCalled();
  });

  it('does not enqueue Storage on a Freenet farm', async () => {
    usesCloudSyncOutbox.mockReturnValue(false);
    isFreenetFarm.mockReturnValue(true);
    publishIssuePhotoToFreenet.mockResolvedValue({
      uri: 'FN02@photo',
      contentHash: 'ab'.repeat(32),
      indexHash: 'cd'.repeat(32),
    });
    const result = await attachIssuePhoto('farm-1', 'issue-1', ORIGINAL, { createdBy: 'uid-1' });
    expect(result.pipe).toBe('freenet');
    expect(enqueuePhoto).not.toHaveBeenCalled();
    expect(publishIssuePhotoToFreenet).toHaveBeenCalledOnce();
    expect(updateIssue.mock.calls.some((call) => call[3] && call[3].publishHot === false)).toBe(true);
  });
});
