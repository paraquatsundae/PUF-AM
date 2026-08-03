import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  decryptHotBlob,
  encryptHotBlob,
  MemoryMistStore,
  hotKey,
  sha256Hex,
} from '../units/mist-freenet/src/index.ts';
import { assembleFarmExportEnvelope } from '../src/lib/farmExport';
import { buildHotStateFromFarmExport } from '../src/mist/hotAdapter';
import type { DiaryEvent } from '../src/lib/farmDiary';

const FARM_ID = 'testfarm00000001';
const FARM_SEED = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32,
]);

async function publishExportToHotStore(
  store: MemoryMistStore,
  farmId: string,
  diary: DiaryEvent[],
  farmSeed: Uint8Array,
) {
  const exportBundle = assembleFarmExportEnvelope({
    farmId,
    source: 'mist',
    diary,
    issues: [],
    issuesArchive: [],
    blockNames: new Map(),
  });
  const hotState = buildHotStateFromFarmExport(exportBundle);
  const plainBytes = new TextEncoder().encode(JSON.stringify(hotState));
  const stored = await encryptHotBlob(plainBytes, farmSeed);
  const storageKey = hotKey(farmId, 'current');
  await store.put(storageKey, stored, {
    kind: 'hot',
    content_hash: sha256Hex(stored),
    size: stored.byteLength,
  });
  return { storageKey, recordCount: hotState.records.length, contentHash: sha256Hex(stored) };
}

describe('mistHotBridge publish path', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds hot payload from fixtures and publishes to MemoryMistStore', async () => {
    const store = new MemoryMistStore();
    const diary: DiaryEvent[] = [
      {
        id: 'evt-1',
        date: '2026-08-03',
        type: 'work',
        status: 'planned',
        title: 'Fence repair',
        updatedAt: '2026-08-03T09:00:00.000Z',
      },
    ];

    const result = await publishExportToHotStore(store, FARM_ID, diary, FARM_SEED);
    expect(result.recordCount).toBe(1);

    const entry = await store.get(result.storageKey);
    expect(entry).not.toBeNull();

    const plain = await decryptHotBlob(entry!.ciphertext, FARM_SEED);
    const hot = JSON.parse(new TextDecoder().decode(plain));
    expect(hot.farm_id).toBe(FARM_ID);
    expect(hot.records[0].payload.title).toBe('Fence repair');
  });
});
