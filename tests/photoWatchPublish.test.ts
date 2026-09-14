/**
 * @vitest-environment jsdom
 *
 * Photo PUT must bump the same Hot-watch slot without a new Hot blob.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishHotWatchSlot = vi.fn(async () => undefined);
const resolveMistReadKeys = vi.fn();

vi.mock('../src/mist/hotWatchSlot.ts', () => ({
  publishHotWatchSlot: (...args: unknown[]) => publishHotWatchSlot(...(args as [])),
  readHotWatchSlot: vi.fn(),
}));

vi.mock('../src/mist/mistHotBridge.ts', () => ({
  resolveMistReadKeys: (...args: unknown[]) => resolveMistReadKeys(...args),
  readMistHotCurrent: vi.fn(),
}));

vi.mock('../src/mist/mistDeviceSession.ts', () => ({
  mistSessionCloudFarmId: () => null,
}));

import { saveMistPhotoIndexStatus } from '../src/mist/mistPhotoBridge';
import { saveFreenetHotUri } from '../src/mist/mistHotPublishMeta';
import { publishHotWatchAfterPhotoPut } from '../src/mist/hotWatchSync';

const FARM_ID = 'photo-watch-farm-1';
const HOT_HASH = 'aa'.repeat(32);
const PHOTO_HASH = 'cc'.repeat(32);

describe('publishHotWatchAfterPhotoPut', () => {
  beforeEach(() => {
    localStorage.clear();
    publishHotWatchSlot.mockClear();
    resolveMistReadKeys.mockResolvedValue({
      hotKey: new Uint8Array(32).fill(1),
      bonesKey: new Uint8Array(32).fill(2),
    });
    saveFreenetHotUri(FARM_ID, {
      freenetUri: 'FN02@hot',
      contentHash: HOT_HASH,
    });
    saveMistPhotoIndexStatus({
      farmId: FARM_ID,
      freenetUri: 'FN02@photos',
      contentHash: PHOTO_HASH,
    });
  });

  it('bumps the watch ping with photo-index URI and hash (HotKey only)', async () => {
    const ping = await publishHotWatchAfterPhotoPut(FARM_ID);
    expect(ping).not.toBeNull();
    expect(ping?.hotContentHash).toBe(HOT_HASH);
    expect(ping?.photoIndexUri).toBe('FN02@photos');
    expect(ping?.photoIndexHash).toBe(PHOTO_HASH);
    expect(publishHotWatchSlot).toHaveBeenCalledOnce();
    const [sent, hotKey] = publishHotWatchSlot.mock.calls[0] as unknown as [
      { photoIndexHash?: string },
      Uint8Array,
    ];
    expect(sent.photoIndexHash).toBe(PHOTO_HASH);
    expect(hotKey.byteLength).toBe(32);
    expect(JSON.stringify(sent)).not.toMatch(/farmSeed/i);
  });
});
