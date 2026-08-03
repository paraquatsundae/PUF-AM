import { describe, expect, it } from 'vitest';
import {
  decryptHotBlob,
  deriveHotContractKey,
  encryptHotBlob,
  MemoryMistStore,
  hotKey,
  sha256Hex,
  type HotState,
} from './src/index.ts';
import { hkdfSha256, MIST_HKDF_SALT } from './src/farm-seed.ts';
import {
  assembleFarmExportEnvelope,
} from '../../src/lib/farmExport';
import type { DiaryEvent } from '../../src/lib/farmDiary';
import type { FieldIssue } from '../../src/lib/fieldStore';
import { buildHotStateFromFarmExport } from '../../src/mist/hotAdapter';

const FARM_ID = 'abc123farmid0001';
const FARM_SEED = new Uint8Array(32).fill(7);

describe('hot-crypto', () => {
  it('derives stable hot contract key from FarmSeed', async () => {
    const key = await deriveHotContractKey(FARM_SEED);
    const expected = await hkdfSha256(FARM_SEED, MIST_HKDF_SALT, 'freenet-hot', 32);
    expect(key).toEqual(expected);
  });

  it('round-trips HotState JSON through AEAD envelope', async () => {
    const plain: HotState = {
      farm_id: FARM_ID,
      window_start: '2026-05-01T00:00:00.000Z',
      records: [],
      tombstones: [],
      last_sealed: null,
    };
    const plainBytes = new TextEncoder().encode(JSON.stringify(plain));
    const wrapped = await encryptHotBlob(plainBytes, FARM_SEED);
    const unwrapped = await decryptHotBlob(wrapped, FARM_SEED);
    expect(JSON.parse(new TextDecoder().decode(unwrapped))).toEqual(plain);
  });

  it('passes through plaintext HotState JSON (seal-hot workshop compat)', async () => {
    const plain: HotState = {
      farm_id: FARM_ID,
      window_start: '2026-05-01T00:00:00.000Z',
      records: [{ id: 'r1', type: 'diary', ts: '2026-06-01T00:00:00.000Z', author: 'dev', payload: {} }],
      tombstones: [],
      last_sealed: null,
    };
    const plainBytes = new TextEncoder().encode(JSON.stringify(plain));
    const out = await decryptHotBlob(plainBytes, FARM_SEED);
    expect(out).toEqual(plainBytes);
  });
});

describe('hotAdapter', () => {
  const diary: DiaryEvent[] = [
    {
      id: 'd1',
      date: '2026-08-02',
      type: 'spray',
      agentName: 'Test',
      updatedAt: '2026-08-02T10:00:00.000Z',
    },
  ];

  const issue: FieldIssue = {
    id: 'i1',
    lat: -31,
    lng: 116,
    category: 'pest',
    priority: 'low',
    status: 'open',
    reportedBy: 'uid1',
    reportedAt: '2026-08-01T08:00:00.000Z',
  };

  it('builds HotState records from farm-export envelope', () => {
    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      farmName: 'Test Farm',
      source: 'mist',
      diary,
      issues: [issue],
      issuesArchive: [],
      blockNames: new Map(),
      exportedAt: '2026-08-03T00:00:00.000Z',
    });

    const hot = buildHotStateFromFarmExport(exportBundle, { now: Date.parse('2026-08-03T00:00:00.000Z') });

    expect(hot.farm_id).toBe(FARM_ID);
    expect(hot.records).toHaveLength(2);
    expect(hot.records[0]?.type).toBe('spray');
    expect(hot.records[0]?.payload).toMatchObject({ id: 'd1', agentName: 'Test' });
    expect(hot.records[1]?.type).toBe('issue');
    expect((hot.records[1]?.payload as FieldIssue).id).toBe('i1');
    expect(hot.window_start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('mist Hot publish (MemoryMistStore)', () => {
  it('put/get hot/current with encrypted HotState blob', async () => {
    const store = new MemoryMistStore();
    const issue: FieldIssue = {
      id: 'i1',
      lat: -31,
      lng: 116,
      category: 'other',
      priority: 'medium',
      status: 'open',
      reportedBy: 'uid1',
      reportedAt: '2026-08-01T08:00:00.000Z',
      photoData: 'base64junk',
    };

    const exportBundle = assembleFarmExportEnvelope({
      farmId: FARM_ID,
      source: 'mist',
      diary: [],
      issues: [issue],
      issuesArchive: [],
      blockNames: new Map(),
    });

    const hotState = buildHotStateFromFarmExport(exportBundle);
    const plainBytes = new TextEncoder().encode(JSON.stringify(hotState));
    const stored = await encryptHotBlob(plainBytes, FARM_SEED);
    const key = hotKey(FARM_ID, 'current');

    await store.put(key, stored, {
      kind: 'hot',
      content_hash: sha256Hex(stored),
      size: stored.byteLength,
    });

    const entry = await store.get(key);
    expect(entry?.meta.kind).toBe('hot');

    const decrypted = await decryptHotBlob(entry!.ciphertext, FARM_SEED);
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as HotState;
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]?.type).toBe('issue');
    const payload = parsed.records[0]?.payload as { hasPhoto?: boolean; photoData?: string };
    expect(payload.hasPhoto).toBe(true);
    expect(payload.photoData).toBeUndefined();
  });
});
