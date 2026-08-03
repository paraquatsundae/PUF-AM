/**
 * Farm geometry bones pack/unpack for mist Freenet sync.
 *
 * Source: sentinut_farm_geometry IndexedDB → AEAD bones asset `farm-geometry`.
 */

import type { FarmGeometryBundle } from '../lib/farmGeometryIdb';
import { getFarmGeometry, saveFarmGeometry } from '../lib/farmGeometryIdb';

export const BONES_FARM_GEOMETRY_ASSET_ID = 'farm-geometry';

/** Versioned plaintext payload before AEAD wrap. */
export type BonesFarmGeometryPayload = {
  v: 1;
  kind: 'farm-geometry';
  farmId: string;
  exportedAt: string;
  blocks: FarmGeometryBundle['blocks'];
  pins: FarmGeometryBundle['pins'];
  tracks: FarmGeometryBundle['tracks'];
  viewport: FarmGeometryBundle['viewport'];
};

export type PackBonesGeometryResult = {
  payload: BonesFarmGeometryPayload;
  plainBytes: Uint8Array;
};

export type RehydrateGeometryResult = {
  before: GeometryCounts;
  after: GeometryCounts;
  bundle: FarmGeometryBundle;
};

export type GeometryCounts = {
  blocks: number;
  pins: number;
  tracks: number;
  hasViewport: boolean;
};

export function countGeometry(bundle: Pick<FarmGeometryBundle, 'blocks' | 'pins' | 'tracks' | 'viewport'>): GeometryCounts {
  return {
    blocks: bundle.blocks.length,
    pins: bundle.pins.length,
    tracks: bundle.tracks.length,
    hasViewport: bundle.viewport !== null,
  };
}

/** Build versioned bones JSON from local geometry IDB. */
export async function packFarmGeometryFromIdb(farmId: string): Promise<PackBonesGeometryResult> {
  const bundle = await getFarmGeometry(farmId);
  const payload: BonesFarmGeometryPayload = {
    v: 1,
    kind: 'farm-geometry',
    farmId,
    exportedAt: new Date().toISOString(),
    blocks: bundle.blocks,
    pins: bundle.pins,
    tracks: bundle.tracks,
    viewport: bundle.viewport,
  };
  const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
  return { payload, plainBytes };
}

/** Parse plaintext bones bytes (post-decrypt). */
export function parseBonesFarmGeometryPayload(bytes: Uint8Array): BonesFarmGeometryPayload {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as BonesFarmGeometryPayload;
  if (parsed.v !== 1 || parsed.kind !== 'farm-geometry' || typeof parsed.farmId !== 'string') {
    throw new Error('Invalid farm-geometry bones payload');
  }
  if (!Array.isArray(parsed.blocks) || !Array.isArray(parsed.pins) || !Array.isArray(parsed.tracks)) {
    throw new Error('farm-geometry bones payload missing geometry arrays');
  }
  return parsed;
}

/** Write bones payload into sentinut_farm_geometry (full replace). */
export async function rehydrateFarmGeometryFromBones(
  farmId: string,
  payload: BonesFarmGeometryPayload,
): Promise<RehydrateGeometryResult> {
  if (payload.farmId !== farmId) {
    throw new Error(`Bones farmId mismatch: expected ${farmId}, got ${payload.farmId}`);
  }

  const beforeBundle = await getFarmGeometry(farmId);
  const before = countGeometry(beforeBundle);

  const bundle: FarmGeometryBundle = {
    farmId,
    blocks: payload.blocks,
    pins: payload.pins,
    tracks: payload.tracks,
    viewport: payload.viewport ?? null,
    updatedAt: new Date().toISOString(),
  };

  await saveFarmGeometry(bundle);
  const after = countGeometry(bundle);

  return { before, after, bundle };
}
