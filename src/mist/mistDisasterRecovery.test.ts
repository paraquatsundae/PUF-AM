import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  encryptHotBlob,
  hotKey,
  MemoryMistStore,
  sha256Hex,
} from '../../units/mist-freenet/src/index.ts';
import type { DiaryEvent } from '../lib/farmDiary';
import type { FieldIssue } from '../lib/fieldStore';
import { assembleFarmExportEnvelope } from '../lib/farmExport';
import {
  countLocalFarmEntities,
  replaceLocalEntities,
  wipeLocalFarmEntitiesForFarm,
} from '../lib/localFarmRepo';
import { buildHotStateFromFarmExport, hotStateToFarmEntities } from './hotAdapter';
import * as mistHotBridge from './mistHotBridge.ts';
import {
  rehydrateLocalFarmFromHot,
  wipeLocalFarmForDisasterRecovery,
} from './mistDisasterRecovery';

const FARM_ID = 'testfarm00000001';
const FARM_SEED = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32,
]);

const sampleDiary: DiaryEvent[] = [
  {
    id: 'evt-1',
    date: '2026-08-03',
    type: 'work',
    status: 'planned',
    title: 'Fence repair',
    updatedAt: '2026-08-03T09:00:00.000Z',
  },
];

const sampleIssue: FieldIssue = {
  id: 'iss-1',
  lat: -34.1,
  lng: 150.2,
  category: 'pest',
  priority: 'high',
  status: 'open',
  reportedBy: 'Alice',
  reportedAt: '2026-08-03T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
};

describe('hotAdapter round-trip', () => {
  it('hotStateToFarmEntities inverts buildHotStateFromFarmExport', () => {
    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: sampleDiary,
      issues: [sampleIssue],
      issuesArchive: [],
      blockNames: new Map(),
    });

    const hot = buildHotStateFromFarmExport(exportBundle);
    const entities = hotStateToFarmEntities(hot);

    expect(entities.diary).toHaveLength(1);
    expect(entities.diary[0]?.title).toBe('Fence repair');
    expect(entities.issues).toHaveLength(1);
    expect(entities.issues[0]?.id).toBe('iss-1');
    expect(entities.issuesArchive).toHaveLength(0);
  });
});

describe('mistDisasterRecovery local wipe + rehydrate', () => {
  beforeEach(async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    await replaceLocalEntities(FARM_ID, 'diary', sampleDiary);
    await replaceLocalEntities(FARM_ID, 'issues', [sampleIssue]);
    await replaceLocalEntities(FARM_ID, 'issues_archive', []);
  });

  afterEach(async () => {
    await wipeLocalFarmEntitiesForFarm(FARM_ID);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('wipeLocalFarmEntitiesForFarm clears diary/issues and outbox', async () => {
    const before = await countLocalFarmEntities(FARM_ID);
    expect(before.diary).toBe(1);
    expect(before.issues).toBe(1);

    const wiped = await wipeLocalFarmEntitiesForFarm(FARM_ID);
    expect(wiped.diary).toBe(1);
    expect(wiped.issues).toBe(1);

    const after = await countLocalFarmEntities(FARM_ID);
    expect(after.diary).toBe(0);
    expect(after.issues).toBe(0);
    expect(after.outbox).toBe(0);
  });

  it('rehydrateLocalFarmFromHot restores entities from HotState', async () => {
    await wipeLocalFarmEntitiesForFarm(FARM_ID);

    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: sampleDiary,
      issues: [sampleIssue],
      issuesArchive: [],
      blockNames: new Map(),
    });
    const hot = buildHotStateFromFarmExport(exportBundle);

    const result = await rehydrateLocalFarmFromHot(FARM_ID, hot);
    expect(result.before.diary).toBe(0);
    expect(result.after.diary).toBe(1);
    expect(result.after.issues).toBe(1);
    expect(result.hot.records).toBe(2);
  });

  it('wipeLocalFarmForDisasterRecovery clears hot blob when mist store is available', async () => {
    const store = new MemoryMistStore();
    const hot = buildHotStateFromFarmExport(
      assembleFarmExportEnvelope({
        farmId: FARM_ID,
        source: 'mist',
        diary: sampleDiary,
        issues: [],
        issuesArchive: [],
        blockNames: new Map(),
      }),
    );
    const plainBytes = new TextEncoder().encode(JSON.stringify(hot));
    const stored = await encryptHotBlob(plainBytes, FARM_SEED);
    const key = hotKey(FARM_ID, 'current');
    await store.put(key, stored, { kind: 'hot', content_hash: sha256Hex(stored) });

    vi.spyOn(mistHotBridge, 'getMistStoreForHotBridge').mockResolvedValue(store);

    const result = await wipeLocalFarmForDisasterRecovery(FARM_ID);
    expect(result.before.diary).toBe(1);
    expect(result.after.diary).toBe(0);
    expect(result.clearedHot).toBe(true);
    expect(await store.get(key)).toBeNull();

    const rehydrated = await rehydrateLocalFarmFromHot(FARM_ID, hot);
    expect(rehydrated.after.diary).toBe(1);
  });
});
