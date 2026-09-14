/**
 * Per-device satellite vs street choice. Freenet Bones may carry an explicit
 * newer layer; otherwise a Hot/Bones apply must not reset the local basemap.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14 (basemap)
 */

export type MapLayerChoice = 'vector' | 'satellite';

export type MapLayerPreference = {
  layer: MapLayerChoice;
  updatedAt: string;
};

const PREFIX = 'pufam.mapLayer.v1';
type LayerListener = (farmId: string, layer: MapLayerChoice) => void;
const layerListeners = new Set<LayerListener>();

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function key(farmId: string): string {
  return `${PREFIX}.${farmId}`;
}

export function isMapLayerChoice(value: unknown): value is MapLayerChoice {
  return value === 'vector' || value === 'satellite';
}

export function readMapLayerPreference(farmId?: string | null): MapLayerPreference | null {
  if (!farmId) return null;
  const raw = storage()?.getItem(key(farmId));
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as MapLayerPreference;
    if (!isMapLayerChoice(row.layer) || typeof row.updatedAt !== 'string' || !row.updatedAt) {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

export function writeMapLayerPreference(
  farmId: string,
  layer: MapLayerChoice,
  updatedAt?: string,
): MapLayerPreference {
  const row: MapLayerPreference = {
    layer,
    updatedAt: updatedAt || new Date().toISOString(),
  };
  storage()?.setItem(key(farmId), JSON.stringify(row));
  for (const listener of layerListeners) listener(farmId, row.layer);
  return row;
}

/** Same-tab updates after a Hot/Bones apply writes the preference. */
export function subscribeMapLayerPreference(
  farmId: string | undefined,
  onChange: (layer: MapLayerChoice) => void,
): () => void {
  if (!farmId) return () => {};
  const listener: LayerListener = (id, layer) => {
    if (id === farmId) onChange(layer);
  };
  layerListeners.add(listener);
  return () => {
    layerListeners.delete(listener);
  };
}

/**
 * Keep the local layer unless the incoming record names one *and* is newer.
 * A snapshot that omits `mapLayer` never resets satellite.
 */
export function mergeMapLayerPreference(
  local: MapLayerPreference | null,
  incoming: { layer?: unknown; updatedAt?: unknown } | null | undefined,
): MapLayerPreference | null {
  if (!isMapLayerChoice(incoming?.layer)) return local;
  const incomingAt = typeof incoming?.updatedAt === 'string' ? incoming.updatedAt : '';
  if (!incomingAt) return local ?? { layer: incoming.layer, updatedAt: new Date().toISOString() };
  if (!local) return { layer: incoming.layer, updatedAt: incomingAt };
  const localT = Date.parse(local.updatedAt) || 0;
  const incomingT = Date.parse(incomingAt) || 0;
  return incomingT > localT ? { layer: incoming.layer, updatedAt: incomingAt } : local;
}

export function applyIncomingMapLayer(
  farmId: string,
  incoming: { mapLayer?: unknown; mapLayerUpdatedAt?: unknown } | null | undefined,
): MapLayerPreference | null {
  const merged = mergeMapLayerPreference(readMapLayerPreference(farmId), {
    layer: incoming?.mapLayer,
    updatedAt: incoming?.mapLayerUpdatedAt,
  });
  if (merged) writeMapLayerPreference(farmId, merged.layer, merged.updatedAt);
  return merged;
}
