import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

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
import {
  encryptBonesBlob,
  decryptBonesBlob,
  deriveBonesContractKey,
  bonesKey,
  sha256Hex,
  MemoryMistStore,
} from '../../units/mist-freenet/src/index.ts';
import { hkdfSha256, MIST_HKDF_SALT } from '../../units/mist-freenet/src/farm-seed.ts';
import type { OrchardBlock } from '../lib/mapStore';
import {
  BONES_FARM_GEOMETRY_ASSET_ID,
  packFarmGeometryFromIdb,
  parseBonesFarmGeometryPayload,
  rehydrateFarmGeometryFromBones,
  type BonesFarmGeometryPayload,
} from './bonesGeometry';
import * as farmGeometryIdb from '../lib/farmGeometryIdb';

const FARM_ID = 'testfarmgeom0001';
const FARM_SEED = new Uint8Array(32).fill(9);

const sampleBlock: OrchardBlock = {
  id: 'block-1',
  name: 'North paddock',
  cultivar: 'Chandler',
  density: 'medium',
  irrigation: 'drip',
  geojson: {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[150.1, -34.1], [150.2, -34.1], [150.2, -34.0], [150.1, -34.0], [150.1, -34.1]]] },
    properties: {},
  },
};

describe('bones-crypto', () => {
  it('derives stable bones contract key from FarmSeed', async () => {
    const key = await deriveBonesContractKey(FARM_SEED);
    const expected = await hkdfSha256(FARM_SEED, MIST_HKDF_SALT, 'freenet-bones', 32);
    expect(key).toEqual(expected);
  });

  it('round-trips farm-geometry JSON through AEAD envelope', async () => {
    const payload: BonesFarmGeometryPayload = {
      v: 1,
      kind: 'farm-geometry',
      farmId: FARM_ID,
      exportedAt: '2026-08-03T00:00:00.000Z',
      blocks: [sampleBlock],
      pins: [],
      tracks: [],
      viewport: { lat: -34.1, lng: 150.15, zoom: 14 },
    };
    const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
    const wrapped = await encryptBonesBlob(plainBytes, FARM_SEED);
    const unwrapped = await decryptBonesBlob(wrapped, FARM_SEED);
    expect(parseBonesFarmGeometryPayload(unwrapped)).toEqual(payload);
  });
});

describe('bonesGeometry pack/unpack', () => {
  beforeEach(async () => {
    await farmGeometryIdb.saveFarmGeometry({
      farmId: FARM_ID,
      blocks: [sampleBlock],
      pins: [],
      tracks: [],
      viewport: { lat: -34.1, lng: 150.15, zoom: 14 },
      updatedAt: '2026-08-03T00:00:00.000Z',
    });
  });

  afterEach(async () => {
    await farmGeometryIdb.saveFarmGeometry({
      farmId: FARM_ID,
      blocks: [],
      pins: [],
      tracks: [],
      viewport: null,
      updatedAt: new Date().toISOString(),
    });
    try {
      localStorage.removeItem(`pufam.mapLayer.v1.${FARM_ID}`);
    } catch {
      /* ignore */
    }
  });

  it('packFarmGeometryFromIdb includes blocks/pins/tracks/viewport', async () => {
    const { payload } = await packFarmGeometryFromIdb(FARM_ID);
    expect(payload.v).toBe(1);
    expect(payload.kind).toBe('farm-geometry');
    expect(payload.blocks).toHaveLength(1);
    expect(payload.blocks[0]?.name).toBe('North paddock');
    expect(payload.viewport?.zoom).toBe(14);
  });

  it('rehydrateFarmGeometryFromBones writes to sentinut_farm_geometry', async () => {
    await farmGeometryIdb.saveFarmGeometry({
      farmId: FARM_ID,
      blocks: [],
      pins: [],
      tracks: [],
      viewport: null,
      updatedAt: new Date().toISOString(),
    });

    const payload: BonesFarmGeometryPayload = {
      v: 1,
      kind: 'farm-geometry',
      farmId: FARM_ID,
      exportedAt: '2026-08-03T00:00:00.000Z',
      blocks: [sampleBlock],
      pins: [],
      tracks: [],
      viewport: { lat: -34.1, lng: 150.15, zoom: 14 },
    };

    const result = await rehydrateFarmGeometryFromBones(FARM_ID, payload);
    expect(result.before.blocks).toBe(0);
    expect(result.after.blocks).toBe(1);

    const readBack = await farmGeometryIdb.getFarmGeometry(FARM_ID);
    expect(readBack.blocks[0]?.id).toBe('block-1');
    expect(readBack.viewport?.zoom).toBe(14);
  });

  it('mergeFarmGeometryFromBones keeps local-only paddocks and LWW on id', async () => {
    const { mergeFarmGeometryFromBones } = await import('./bonesGeometry');
    const linuxOnly: OrchardBlock = {
      ...sampleBlock,
      id: 'linux-only',
      name: 'West dam',
      updatedAt: '2026-09-13T01:00:00.000Z',
    };
    const sharedOld: OrchardBlock = {
      ...sampleBlock,
      id: 'shared',
      name: 'North old',
      updatedAt: '2026-09-13T02:00:00.000Z',
    };
    await farmGeometryIdb.saveFarmGeometry({
      farmId: FARM_ID,
      blocks: [linuxOnly, sharedOld],
      pins: [],
      tracks: [],
      viewport: { lat: -34.2, lng: 150.1, zoom: 13 },
      updatedAt: '2026-09-13T02:00:00.000Z',
    });

    const tabletEdit: OrchardBlock = {
      ...sampleBlock,
      id: 'shared',
      name: 'North tablet',
      updatedAt: '2026-09-13T03:00:00.000Z',
    };
    const result = await mergeFarmGeometryFromBones(FARM_ID, {
      v: 1,
      kind: 'farm-geometry',
      farmId: FARM_ID,
      exportedAt: '2026-09-13T03:00:00.000Z',
      blocks: [tabletEdit],
      pins: [],
      tracks: [],
      viewport: { lat: -33.9, lng: 115.0, zoom: 16 },
    });

    expect(result.after.blocks).toBe(2);
    const names = result.bundle.blocks.map((b) => b.name).sort();
    expect(names).toEqual(['North tablet', 'West dam']);
    expect(result.bundle.viewport?.zoom).toBe(13);
  });

  it('empty incoming Bones does not wipe tablet-local paddocks', async () => {
    const { mergeFarmGeometryFromBones } = await import('./bonesGeometry');
    await farmGeometryIdb.saveFarmGeometry({
      farmId: FARM_ID,
      blocks: [{ ...sampleBlock, updatedAt: '2026-09-14T08:00:00.000Z' }],
      pins: [],
      tracks: [],
      viewport: { lat: -34.2, lng: 150.1, zoom: 13 },
      updatedAt: '2026-09-14T08:00:00.000Z',
    });
    const result = await mergeFarmGeometryFromBones(FARM_ID, {
      v: 1,
      kind: 'farm-geometry',
      farmId: FARM_ID,
      exportedAt: '2026-09-14T09:00:00.000Z',
      blocks: [],
      pins: [],
      tracks: [],
      viewport: { lat: 0, lng: 0, zoom: 1 },
    });
    expect(result.after.blocks).toBe(1);
    expect(result.bundle.blocks[0]?.id).toBe('block-1');
    expect(result.bundle.viewport?.zoom).toBe(13);
  });

  it('merge keeps local satellite when incoming Bones omits mapLayer', async () => {
    const { mergeFarmGeometryFromBones } = await import('./bonesGeometry');
    const { writeMapLayerPreference, readMapLayerPreference } = await import(
      '../lib/mapLayerPreference'
    );
    writeMapLayerPreference(FARM_ID, 'satellite', '2026-09-14T02:00:00.000Z');
    await mergeFarmGeometryFromBones(FARM_ID, {
      v: 1,
      kind: 'farm-geometry',
      farmId: FARM_ID,
      exportedAt: '2026-09-14T04:00:00.000Z',
      blocks: [sampleBlock],
      pins: [],
      tracks: [],
      viewport: { lat: -33.9, lng: 115.0, zoom: 10 },
    });
    expect(readMapLayerPreference(FARM_ID)?.layer).toBe('satellite');
  });
});

describe('mist bones store round-trip', () => {
  it('put/get farm-geometry with encrypted blob', async () => {
    const store = new MemoryMistStore();
    const payload: BonesFarmGeometryPayload = {
      v: 1,
      kind: 'farm-geometry',
      farmId: FARM_ID,
      exportedAt: '2026-08-03T00:00:00.000Z',
      blocks: [sampleBlock],
      pins: [],
      tracks: [],
      viewport: null,
    };
    const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
    const stored = await encryptBonesBlob(plainBytes, FARM_SEED);
    const key = bonesKey(FARM_ID, BONES_FARM_GEOMETRY_ASSET_ID);

    await store.put(key, stored, {
      kind: 'bones',
      content_hash: sha256Hex(stored),
      version: 1,
    });

    const entry = await store.get(key);
    expect(entry?.meta.kind).toBe('bones');

    const decrypted = await decryptBonesBlob(entry!.ciphertext, FARM_SEED);
    const parsed = parseBonesFarmGeometryPayload(decrypted);
    expect(parsed.blocks[0]?.name).toBe('North paddock');
  });
});
