/**
 * Freenet Hot watch: generation bump, cheap no-change, apply highlight without FarmSeed.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const memoryLs = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memoryLs.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryLs.set(key, value);
      },
      removeItem: (key: string) => {
        memoryLs.delete(key);
      },
    },
  });
}
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({}) }));
vi.mock('../src/lib/farmGeometrySync', () => ({
  loadFarmGeometryLocalFirst: vi.fn(),
  flushPendingGeometry: vi.fn().mockResolvedValue(undefined),
  pendingGeometryCount: vi.fn().mockResolvedValue(0),
  persistBlock: vi.fn(),
  persistPin: vi.fn(),
  persistTrack: vi.fn(),
  persistViewport: vi.fn().mockResolvedValue(undefined),
  removeBlockPersisted: vi.fn(),
  removePinPersisted: vi.fn(),
  removeTrackPersisted: vi.fn(),
}));

import { assembleFarmExportEnvelope } from '../src/lib/farmExport';
import {
  buildMapHighlight,
  listLocalHighlights,
  MAP_HIGHLIGHT_HOT_TYPE,
} from '../src/lib/mapHighlights';
import { useFarmDiaryStore } from '../src/lib/farmDiaryStore';
import { useMapStoreInternal } from '../src/lib/mapStore';
import {
  buildHotStateFromFarmExport,
  hotStateToFarmEntities,
} from '../src/mist/hotAdapter';
import {
  mergeHotEntitiesIntoLocal,
  nextHotWatchGeneration,
  readHotWatchCursor,
  refreshFarmUiAfterHotMerge,
  writeHotWatchCursor,
} from '../src/mist/hotWatchSync';
import { persistHighlightAndDiary, planHighlightDiary } from '../src/lib/highlightDiary';
import { hotWatchPingChanged } from '../units/mist-freenet/src/hot-watch.ts';

const FARM_ID = 'hot-watch-farm-0001';

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

afterEach(() => {
  try {
    localStorage.removeItem(`pufam.mist.hotWatch.v1.${FARM_ID}`);
  } catch {
    /* node without localStorage */
  }
});

describe('hot watch sync', () => {
  it('bumps generation when a highlight publish would land', () => {
    writeHotWatchCursor(FARM_ID, {
      generation: 10,
      hotContentHash: 'aa'.repeat(32),
    });
    const next = nextHotWatchGeneration(FARM_ID, 11);
    expect(next).toBeGreaterThan(10);
    expect(readHotWatchCursor(FARM_ID)?.generation).toBe(10);
  });

  it('ping no-change is cheap — same hash does not ask for Hot', () => {
    const hash = 'ef'.repeat(32);
    writeHotWatchCursor(FARM_ID, { generation: 5, hotContentHash: hash });
    const local = readHotWatchCursor(FARM_ID);
    expect(
      hotWatchPingChanged(local, {
        generation: 9,
        hotContentHash: hash,
      }),
    ).toBe(false);
  });

  it('ping yes applies map_highlight with directedAt and no FarmSeed', async () => {
    const now = Date.parse('2026-09-12T14:00:00.000Z');
    const highlight = buildMapHighlight({
      geojson: sampleGeo,
      createdBy: 'mist_owner',
      displayName: 'George',
      note: 'Check the south valve',
      directedAtName: 'Tablet crew',
      directedAtUid: 'ticket-row-9',
      durationSeconds: 300,
      nowMs: now,
    });
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
    expect(hot.records.some((r) => r.type === MAP_HIGHLIGHT_HOT_TYPE)).toBe(true);

    const entities = hotStateToFarmEntities(hot);
    const merged = await mergeHotEntitiesIntoLocal(FARM_ID, entities);
    expect(merged.highlights).toBe(1);

    const stored = await listLocalHighlights(FARM_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.directedAtName).toBe('Tablet crew');
    expect(stored[0]?.directedAtUid).toBe('ticket-row-9');
    expect(stored[0]?.note).toBe('Check the south valve');
    expect(JSON.stringify(stored[0])).not.toMatch(/farmSeed/i);
  });

  it('Hot merge does not flip map isLoaded or diary isLoading, or replace viewport', async () => {
    const viewport = { lat: -34.24, lng: 116.14, zoom: 16 };
    useMapStoreInternal.setState({ isLoaded: true, isLoading: false, viewport });
    useFarmDiaryStore.setState({
      isLoaded: true,
      isLoading: false,
      currentFarmId: FARM_ID,
      currentStartDate: '2026-06-01',
      currentEndDate: null,
      events: [],
    });

    const now = Date.parse('2026-09-12T15:00:00.000Z');
    const highlight = buildMapHighlight({
      geojson: sampleGeo,
      createdBy: 'mist_owner',
      displayName: 'George',
      note: 'South valve dripping',
      directedAtName: 'Tablet crew',
      durationSeconds: 300,
      nowMs: now,
    });
    const diary = planHighlightDiary(highlight, now);
    const saved = await persistHighlightAndDiary(FARM_ID, highlight, diary, {
      queueCloud: false,
    });

    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: saved.diary ? [saved.diary] : [],
      issues: [],
      issuesArchive: [],
      blockNames: new Map(),
    });
    const hot = buildHotStateFromFarmExport(exportBundle, {
      farmId: FARM_ID,
      mapHighlights: [saved.highlight],
    });
    await mergeHotEntitiesIntoLocal(FARM_ID, hotStateToFarmEntities(hot));
    await refreshFarmUiAfterHotMerge(FARM_ID);

    const map = useMapStoreInternal.getState();
    expect(map.isLoaded).toBe(true);
    expect(map.isLoading).toBe(false);
    expect(map.viewport).toBe(viewport);

    const diaryStore = useFarmDiaryStore.getState();
    expect(diaryStore.isLoaded).toBe(true);
    expect(diaryStore.isLoading).toBe(false);
    expect(diaryStore.events.some((e) => e.id === saved.diary?.id)).toBe(true);
    expect(saved.highlight.linkedDiaryEventId).toBe(saved.diary?.id);
  });

  it('Bones merge applies paddocks without flipping isLoaded or viewport', async () => {
    const { mergeFarmGeometryFromBones } = await import('../src/mist/bonesGeometry');
    const { refreshFarmUiAfterBonesMerge } = await import('../src/mist/hotWatchSync');
    const { saveFarmGeometry, getFarmGeometry } = await import('../src/lib/farmGeometryIdb');

    const viewport = { lat: -34.24, lng: 116.14, zoom: 16 };
    const linuxOnly = {
      id: 'linux-only',
      name: 'West dam',
      cultivar: '',
      density: '',
      irrigation: '',
      geojson: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
      updatedAt: '2026-09-13T01:00:00.000Z',
    };
    await saveFarmGeometry({
      farmId: FARM_ID,
      blocks: [linuxOnly],
      pins: [],
      tracks: [],
      viewport,
      updatedAt: '2026-09-13T01:00:00.000Z',
    });

    useMapStoreInternal.setState({
      isLoaded: true,
      isLoading: false,
      currentFarmId: FARM_ID,
      viewport,
      blocks: [linuxOnly],
      pins: [],
      tracks: [],
    });

    const tabletBlock = {
      id: 'tablet-1',
      name: 'North',
      cultivar: '',
      density: '',
      irrigation: '',
      geojson: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
      updatedAt: '2026-09-13T03:00:00.000Z',
    };
    await mergeFarmGeometryFromBones(FARM_ID, {
      v: 1,
      kind: 'farm-geometry',
      farmId: FARM_ID,
      exportedAt: '2026-09-13T03:00:00.000Z',
      blocks: [tabletBlock],
      pins: [],
      tracks: [],
      viewport: { lat: -33.9, lng: 115.0, zoom: 10 },
    });
    await refreshFarmUiAfterBonesMerge(FARM_ID);

    const map = useMapStoreInternal.getState();
    expect(map.isLoaded).toBe(true);
    expect(map.isLoading).toBe(false);
    expect(map.viewport).toBe(viewport);
    expect(map.blocks.some((b) => b.id === 'linux-only')).toBe(true);
    expect(map.blocks.some((b) => b.id === 'tablet-1' && b.name === 'North')).toBe(true);

    const stored = await getFarmGeometry(FARM_ID);
    expect(stored.blocks).toHaveLength(2);
    expect(stored.viewport).toEqual(viewport);
  });
});
