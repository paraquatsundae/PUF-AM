/**
 * @vitest-environment jsdom
 *
 * A paddock save must mark Bones pending. Local pack must not wipe the last
 * published Hot/Bones URI pair used on the watch ping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/mist/mistDeviceSession.ts', () => ({
  hasMistDeviceSession: () => true,
  mistSessionCloudFarmId: () => null,
}));

vi.mock('../src/mist/mistHotBridge.ts', () => ({
  isMistHotMirrorAvailable: () => true,
  resolveMistReadKeys: vi.fn(),
  farmSeedLockedError: (what: string) => new Error(what),
  getMistStoreForHotBridge: vi.fn(),
  clearCachedFarmSeedForHot: vi.fn(),
}));

vi.mock('../src/lib/freenetHostHoldOff.ts', () => ({
  isFreenetHostHoldOff: () => false,
}));

vi.mock('../src/mist/freenetPublishLock.ts', () => ({
  freenetFarmPublishInFlight: () => false,
}));

import {
  clearBonesPublishPending,
  getMistBonesPublishStatus,
  getMistHotPublishStatus,
  isBonesPublishPending,
  markBonesPublishPending,
  mergeLocalHotPackStatus,
  saveFreenetBonesUri,
  saveFreenetHotUri,
  saveMistBonesPublishStatus,
} from '../src/mist/mistHotPublishMeta';
import { scheduleMistBonesAutoPublish } from '../src/mist/mistBonesBridge';

const FARM_ID = 'bones-pending-farm-1';
const HOT_HASH = 'aa'.repeat(32);
const BONES_HASH = 'bb'.repeat(32);

describe('Bones pending + local pack URI preserve', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks pending on paddock schedule so a failed PUT can retry', () => {
    expect(isBonesPublishPending(FARM_ID)).toBe(false);
    scheduleMistBonesAutoPublish(FARM_ID);
    expect(isBonesPublishPending(FARM_ID)).toBe(true);
  });

  it('clears pending after a successful mark/clear', () => {
    markBonesPublishPending(FARM_ID);
    expect(isBonesPublishPending(FARM_ID)).toBe(true);
    clearBonesPublishPending(FARM_ID);
    expect(isBonesPublishPending(FARM_ID)).toBe(false);
  });

  it('local Hot pack keeps the last Freenet Hot URI and hash', () => {
    saveFreenetHotUri(FARM_ID, { freenetUri: 'FN02@hot', contentHash: HOT_HASH });
    mergeLocalHotPackStatus(FARM_ID, {
      publishedAt: new Date().toISOString(),
      contentHash: 'ee'.repeat(32),
      recordCount: 1,
      diaryCount: 1,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'hot/current',
    });
    const hot = getMistHotPublishStatus(FARM_ID);
    expect(hot?.freenetUri).toBe('FN02@hot');
    expect(hot?.contentHash).toBe(HOT_HASH);
  });

  it('local Bones pack keeps the last Freenet Bones URI and hash', () => {
    saveFreenetBonesUri(FARM_ID, { freenetUri: 'FN02@bones', contentHash: BONES_HASH });
    saveMistBonesPublishStatus({
      farmId: FARM_ID,
      publishedAt: new Date().toISOString(),
      contentHash: 'ff'.repeat(32),
      blockCount: 3,
      pinCount: 0,
      trackCount: 0,
      hasViewport: false,
      encrypted: true,
      storageKey: 'bones/farm-geometry',
    });
    const bones = getMistBonesPublishStatus(FARM_ID);
    expect(bones?.freenetUri).toBe('FN02@bones');
    expect(bones?.contentHash).toBe(BONES_HASH);
    expect(bones?.blockCount).toBe(3);
  });
});
