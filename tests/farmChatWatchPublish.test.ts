/**
 * @vitest-environment jsdom
 *
 * Second farm-chat line after a successful first PUT must ping the watch.
 * Local pack must not wipe the last Hot URI; never advertise a new
 * farmChatHash with a stale Hot URI.
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
  isMistHotMirrorAvailable: () => true,
}));

vi.mock('../src/mist/mistDeviceSession.ts', () => ({
  hasMistDeviceSession: () => true,
  mistSessionCloudFarmId: () => null,
}));

import { farmChatLinesHash } from '../src/mist/hotAdapter';
import {
  getMistHotPublishStatus,
  hotWatchPairFromStatus,
  mergeLocalHotPackStatus,
  saveFreenetHotUri,
} from '../src/mist/mistHotPublishMeta';
import { publishHotWatchAfterHotPut } from '../src/mist/hotWatchSync';
import { hotWatchPingChanged } from '../units/mist-freenet/src/hot-watch.ts';

const FARM_ID = 'farm-chat-watch-1';
const HOT_HASH_1 = 'aa'.repeat(32);
const HOT_HASH_2 = 'bb'.repeat(32);
const CHAT_1 = [{ id: 'c1', at: '2026-09-15T01:00:00.000Z', authorName: 'Sam', text: 'first' }];
const CHAT_2 = [
  ...CHAT_1,
  { id: 'c2', at: '2026-09-15T01:01:00.000Z', authorName: 'Sam', text: 'second' },
];
const CHAT_HASH_1 = farmChatLinesHash(CHAT_1);
const CHAT_HASH_2 = farmChatLinesHash(CHAT_2);

describe('farm chat watch after first success', () => {
  beforeEach(() => {
    localStorage.clear();
    publishHotWatchSlot.mockClear();
    resolveMistReadKeys.mockResolvedValue({
      hotKey: new Uint8Array(32).fill(1),
      bonesKey: new Uint8Array(32).fill(2),
    });
  });

  it('notices a second chat line when only farmChatHash moved', () => {
    expect(
      hotWatchPingChanged(
        { generation: 5, hotContentHash: HOT_HASH_1, hotUri: 'FN02@hot-1', farmChatHash: CHAT_HASH_1 },
        {
          generation: 6,
          hotContentHash: HOT_HASH_1,
          hotUri: 'FN02@hot-1',
          farmChatHash: CHAT_HASH_2,
        },
      ),
    ).toBe(true);
  });

  it('notices a second chat line when Hot URI moved with the new hash', () => {
    expect(
      hotWatchPingChanged(
        { generation: 5, hotContentHash: HOT_HASH_1, hotUri: 'FN02@hot-1', farmChatHash: CHAT_HASH_1 },
        {
          generation: 6,
          hotContentHash: HOT_HASH_2,
          hotUri: 'FN02@hot-2',
          farmChatHash: CHAT_HASH_2,
        },
      ),
    ).toBe(true);
  });

  it('watch ping carries farmChatHash only with the matching Hot URI', async () => {
    saveFreenetHotUri(FARM_ID, {
      freenetUri: 'FN02@hot-2',
      contentHash: HOT_HASH_2,
      farmChatHash: CHAT_HASH_2,
    });
    const ping = await publishHotWatchAfterHotPut(FARM_ID);
    expect(ping?.hotUri).toBe('FN02@hot-2');
    expect(ping?.hotContentHash).toBe(HOT_HASH_2);
    expect(ping?.farmChatHash).toBe(CHAT_HASH_2);
    expect(JSON.stringify(ping)).not.toMatch(/farmSeed/i);
  });

  it('does not advertise a new farmChatHash with the previous Freenet URI', () => {
    saveFreenetHotUri(FARM_ID, {
      freenetUri: 'FN02@hot-1',
      contentHash: HOT_HASH_1,
      farmChatHash: CHAT_HASH_1,
    });
    mergeLocalHotPackStatus(FARM_ID, {
      publishedAt: new Date().toISOString(),
      contentHash: HOT_HASH_2,
      recordCount: 2,
      diaryCount: 0,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'hot/current',
    });
    const pair = hotWatchPairFromStatus(FARM_ID);
    expect(pair?.hotUri).toBe('FN02@hot-1');
    expect(pair?.hotContentHash).toBe(HOT_HASH_1);
    expect(pair?.farmChatHash).toBe(CHAT_HASH_1);
    expect(pair?.farmChatHash).not.toBe(CHAT_HASH_2);
  });

  it('local Hot pack keeps the last Freenet URI pair and farmChatHash', () => {
    saveFreenetHotUri(FARM_ID, {
      freenetUri: 'FN02@hot-1',
      contentHash: HOT_HASH_1,
      farmChatHash: CHAT_HASH_1,
    });
    mergeLocalHotPackStatus(FARM_ID, {
      publishedAt: new Date().toISOString(),
      contentHash: 'ee'.repeat(32),
      recordCount: 1,
      diaryCount: 0,
      issueCount: 0,
      issueArchiveCount: 0,
      encrypted: true,
      storageKey: 'hot/current',
    });
    const hot = getMistHotPublishStatus(FARM_ID);
    expect(hot?.freenetUri).toBe('FN02@hot-1');
    expect(hot?.contentHash).toBe(HOT_HASH_1);
    expect(hot?.farmChatHash).toBe(CHAT_HASH_1);
  });
});
