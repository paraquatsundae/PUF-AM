import { describe, expect, it } from 'vitest';
import { FREENET02_MAX_BLOB_BYTES } from '../../../units/mist-freenet/src/freenet02-pack-id.ts';
import {
  FARM_EXPORT_FORMAT,
  FARM_EXPORT_VERSION,
  type FarmExportV1,
} from '../../../src/lib/farmExport';
import { buildHotStateFromFarmExport, hotStateToFarmEntities } from '../../../src/mist/hotAdapter';
import {
  FARM_CHAT_HOT_RECORD_ID,
  FARM_CHAT_HOT_TYPE,
  farmChatFitsPackBudget,
  farmChatFromHotRecord,
  farmChatPlainBytes,
  farmChatToHotRecord,
} from './farmChatHot';
import { farmChatHotWatchPairOk, FARM_CHAT_CAP, type FarmChatMessage } from './farmChatLog';

function line(i: number): FarmChatMessage {
  return {
    id: `c${i}`,
    at: `2026-09-15T08:00:${String(i).padStart(2, '0')}.000Z`,
    authorName: 'Sam',
    text: 'Sprayer is down, use the ute',
  };
}

describe('farm chat Hot record', () => {
  it('round-trips a capped log sealed as one HotKey record', () => {
    const messages = [line(1), line(2)];
    const record = farmChatToHotRecord(messages);
    expect(record.type).toBe(FARM_CHAT_HOT_TYPE);
    expect(record.id).toBe(FARM_CHAT_HOT_RECORD_ID);
    expect(record.author).toBe('Sam');
    expect(farmChatFromHotRecord(record)).toEqual(messages);
    expect(JSON.stringify(record)).not.toMatch(/FarmSeed|photoData|image\/jpeg/i);
  });

  it('fits the 64 KiB pack with a full cap of text-only lines', () => {
    const messages = Array.from({ length: FARM_CHAT_CAP }, (_, i) => line(i));
    expect(farmChatFitsPackBudget(messages)).toBe(true);
    expect(farmChatPlainBytes(messages)).toBeLessThan(FREENET02_MAX_BLOB_BYTES);
  });

  it('watch pair must move hash and URI together', () => {
    expect(farmChatHotWatchPairOk({ hotContentHash: 'h1', hotUri: 'fn02@new' })).toBe(true);
    expect(farmChatHotWatchPairOk({ hotContentHash: 'h-new', hotUri: 'fn02@old' })).toBe(true);
    expect(farmChatHotWatchPairOk({ hotContentHash: 'h-new', hotUri: null })).toBe(false);
    expect(
      farmChatHotWatchPairOk({
        hotContentHash: 'h-new',
        hotUri: null,
        farmChatHash: 'c-new',
      }),
    ).toBe(false);
  });

  it('rides hot/current — no new Freenet slot', () => {
    const empty: FarmExportV1 = {
      format: FARM_EXPORT_FORMAT,
      v: FARM_EXPORT_VERSION,
      exportedAt: '2026-09-15T00:00:00.000Z',
      farmId: 'mist-farm',
      farmName: 'Shed',
      source: 'mist',
      exportScope: { diary: 'all', issues: true, issuesArchive: true },
      diary: [],
      issues: [],
      issuesArchive: [],
    };
    const hot = buildHotStateFromFarmExport(empty, { farmChat: [line(1)] });
    expect(hot.records.some((row) => row.type === FARM_CHAT_HOT_TYPE)).toBe(true);
    expect(hotStateToFarmEntities(hot).chat).toEqual([line(1)]);
  });
});
