/**
 * @vitest-environment jsdom
 *
 * Bones PUT must bump the same Hot-watch slot so a geometry-only edit pings.
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

import { saveFreenetBonesUri, saveFreenetHotUri } from '../src/mist/mistHotPublishMeta';
import { publishHotWatchAfterBonesPut } from '../src/mist/hotWatchSync';

const FARM_ID = 'bones-watch-farm-1';
const HOT_HASH = 'aa'.repeat(32);
const BONES_HASH = 'bb'.repeat(32);

describe('publishHotWatchAfterBonesPut', () => {
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
    saveFreenetBonesUri(FARM_ID, {
      freenetUri: 'FN02@bones',
      contentHash: BONES_HASH,
    });
  });

  it('bumps the watch ping with Bones URI and hash (HotKey only)', async () => {
    const ping = await publishHotWatchAfterBonesPut(FARM_ID);
    expect(ping).not.toBeNull();
    expect(ping?.hotUri).toBe('FN02@hot');
    expect(ping?.bonesUri).toBe('FN02@bones');
    expect(ping?.bonesContentHash).toBe(BONES_HASH);
    expect(publishHotWatchSlot).toHaveBeenCalledOnce();
    const [sent, hotKey] = publishHotWatchSlot.mock.calls[0] as unknown as [
      { bonesContentHash?: string },
      Uint8Array,
    ];
    expect(sent.bonesContentHash).toBe(BONES_HASH);
    expect(hotKey.byteLength).toBe(32);
    expect(JSON.stringify(sent)).not.toMatch(/farmSeed/i);
  });
});
