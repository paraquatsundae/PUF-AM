/**
 * Map “check this” highlights in the mist Hot pack.
 * Crew holds HotKey, not FarmSeed — the record must decrypt either way.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  decryptHotBlobWithKey,
  deriveHotContractKey,
  encryptHotBlob,
} from '../units/mist-freenet/src/hot-crypto.ts';
import { assembleFarmExportEnvelope } from '../src/lib/farmExport';
import {
  activeMapHighlights,
  buildMapHighlight,
  listLocalHighlights,
  MAP_HIGHLIGHT_HOT_TYPE,
  upsertLocalHighlight,
} from '../src/lib/mapHighlights';
import {
  buildHotStateFromFarmExport,
  countHotFarmEntities,
  hotStateToFarmEntities,
} from '../src/mist/hotAdapter';
import { rehydrateLocalFarmFromHot } from '../src/mist/mistDisasterRecovery';

const FARM_ID = 'highlight-farm-0001';
const FARM_SEED = new Uint8Array(32).fill(11);

const sampleGeo: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [115.0, -34.0],
      [115.01, -34.0],
      [115.01, -34.01],
      [115.0, -34.01],
      [115.0, -34.0],
    ],
  ],
};

function sampleHighlight(nowMs: number) {
  return buildMapHighlight({
    geojson: sampleGeo,
    createdBy: 'mist_owner',
    displayName: 'George',
    note: 'Valve dripping',
    directedAtName: 'Tablet crew',
    directedAtUid: 'ticket-row-1',
    durationSeconds: 300,
    nowMs,
  });
}

describe('map highlights in mist Hot', () => {
  it('packs an active highlight and round-trips directed-at', () => {
    const now = Date.parse('2026-09-12T10:00:00.000Z');
    const highlight = sampleHighlight(now);
    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: [],
      issues: [],
      issuesArchive: [],
      blockNames: new Map(),
    });

    const hot = buildHotStateFromFarmExport(exportBundle, {
      farmId: FARM_ID,
      mapHighlights: activeMapHighlights([highlight], now),
    });

    expect(hot.records.some((r) => r.type === MAP_HIGHLIGHT_HOT_TYPE)).toBe(true);
    expect(countHotFarmEntities(hot).highlights).toBe(1);

    const back = hotStateToFarmEntities(hot);
    expect(back.highlights).toHaveLength(1);
    expect(back.highlights[0]?.id).toBe(highlight.id);
    expect(back.highlights[0]?.directedAtName).toBe('Tablet crew');
    expect(back.highlights[0]?.directedAtUid).toBe('ticket-row-1');
    expect(back.highlights[0]?.note).toBe('Valve dripping');
    expect(back.highlights[0]?.geojson).toEqual(sampleGeo);
  });

  it('omits expired highlights from the pack', () => {
    const created = Date.parse('2026-09-12T10:00:00.000Z');
    const highlight = sampleHighlight(created);
    const later = created + 301_000;
    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: [],
      issues: [],
      issuesArchive: [],
      blockNames: new Map(),
    });
    const hot = buildHotStateFromFarmExport(exportBundle, {
      mapHighlights: activeMapHighlights([highlight], later),
    });
    expect(countHotFarmEntities(hot).highlights).toBe(0);
  });

  it('crew HotKey decrypts a highlight sealed under FarmSeed', async () => {
    const now = Date.parse('2026-09-12T11:00:00.000Z');
    const highlight = sampleHighlight(now);
    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: [],
      issues: [],
      issuesArchive: [],
      blockNames: new Map(),
    });
    const hot = buildHotStateFromFarmExport(exportBundle, {
      farmId: FARM_ID,
      mapHighlights: [highlight],
    });

    const plain = new TextEncoder().encode(JSON.stringify(hot));
    const sealed = await encryptHotBlob(plain, FARM_SEED);
    const crewHotKey = await deriveHotContractKey(FARM_SEED);
    const opened = await decryptHotBlobWithKey(sealed, crewHotKey);
    const parsed = JSON.parse(new TextDecoder().decode(opened));
    const entities = hotStateToFarmEntities(parsed);

    expect(entities.highlights[0]?.directedAtName).toBe('Tablet crew');
    expect(entities.highlights[0]?.id).toBe(highlight.id);
  });

  it('rehydrate writes directed-at highlights into pufom_farm_local', async () => {
    const now = Date.parse('2026-09-12T12:00:00.000Z');
    const highlight = sampleHighlight(now);
    await upsertLocalHighlight(FARM_ID, highlight);
    expect((await listLocalHighlights(FARM_ID)).map((h) => h.directedAtName)).toEqual([
      'Tablet crew',
    ]);

    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: [],
      issues: [],
      issuesArchive: [],
      blockNames: new Map(),
    });
    const hot = buildHotStateFromFarmExport(exportBundle, {
      farmId: FARM_ID,
      mapHighlights: [highlight],
    });
    const result = await rehydrateLocalFarmFromHot(FARM_ID, hot);
    expect(result.after.highlights).toBe(1);
    const stored = await listLocalHighlights(FARM_ID);
    expect(stored[0]?.directedAtName).toBe('Tablet crew');
  });
});
