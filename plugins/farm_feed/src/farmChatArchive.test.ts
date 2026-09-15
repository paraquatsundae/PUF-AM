import { describe, expect, it } from 'vitest';
import {
  farmChatArchiveContentHash,
  farmChatHostedSealKey,
  formatFarmChatLogTxt,
  openFarmChatDay,
  sealFarmChatDay,
} from './farmChatArchive';
import { farmChatHotWatchPairOk } from './farmChatLog';
import { farmChatLinesHash } from '../../../src/mist/hotAdapter';
import type { FarmChatMessage } from './farmChatLog';

const LINE: FarmChatMessage = {
  id: 'c1',
  at: '2026-09-15T08:00:00.000Z',
  authorName: 'Sam',
  text: 'Sprayer is down, use the ute',
};

describe('farm chat archive seal', () => {
  it('gzips and AEAD-wraps a day, then opens it — never FarmSeed', async () => {
    const key = await farmChatHostedSealKey('farm-a');
    const blob = await sealFarmChatDay('2026-09-15', [LINE], key);
    expect(blob).not.toMatch(/FarmSeed|BonesKey|Sprayer is down/i);
    const opened = await openFarmChatDay(blob, key);
    expect(opened.date).toBe('2026-09-15');
    expect(opened.messages).toEqual([LINE]);
    expect(farmChatArchiveContentHash(blob)).toHaveLength(64);
    expect(formatFarmChatLogTxt('2026-09-15', [LINE])).toContain('Sprayer is down, use the ute');
  });

  it('watch hash moves when the archive index changes, and never with a missing URI', () => {
    const live = [LINE];
    const hashLive = farmChatLinesHash(live);
    const hashArchived = farmChatLinesHash(live, {
      archives: [{ date: '2026-09-14', contentHash: 'ab'.repeat(32), uri: 'FN02@chat-14' }],
    });
    expect(hashArchived).not.toBe(hashLive);
    expect(
      farmChatHotWatchPairOk({
        farmChatHash: hashArchived,
        hotUri: 'FN02@hot-new',
        hotContentHash: 'cd'.repeat(32),
      })
    ).toBe(true);
    expect(farmChatHotWatchPairOk({ farmChatHash: hashArchived, hotUri: '' })).toBe(false);
  });
});
