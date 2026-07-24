/**
 * PUFOM farm sync bundle (.pufom) — versioned snapshot for offline / LAN exchange.
 * Payload is JSON; on disk it is usually gzip (see pufomCodec).
 */

export const PUFOM_FORMAT = 'pufom' as const;
export const PUFOM_VERSION = 1 as const;

export type PufomEntity = {
  id: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type PufomGeometry = {
  blocks: PufomEntity[];
  pins: PufomEntity[];
  tracks: PufomEntity[];
  viewport: Record<string, unknown> | null;
  updatedAt: string;
};

export type PufomBundleV1 = {
  format: typeof PUFOM_FORMAT;
  version: typeof PUFOM_VERSION;
  farmId: string;
  farmName?: string;
  exportedAt: string;
  deviceLabel?: string;
  geometry: PufomGeometry;
  issues: PufomEntity[];
  issuesArchive: PufomEntity[];
  diary: PufomEntity[];
};

export function isPufomBundleV1(value: unknown): value is PufomBundleV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.format === PUFOM_FORMAT &&
    v.version === PUFOM_VERSION &&
    typeof v.farmId === 'string' &&
    typeof v.exportedAt === 'string' &&
    v.geometry != null &&
    typeof v.geometry === 'object' &&
    Array.isArray(v.issues) &&
    Array.isArray(v.issuesArchive) &&
    Array.isArray(v.diary)
  );
}

export function entityStamp(entity: { updatedAt?: string; date?: string; createdAt?: string }): string {
  return entity.updatedAt || entity.date || entity.createdAt || '';
}

/** Last-write-wins by stamp; when both empty, prefer incoming. */
export function mergeByLww<T extends { id: string; updatedAt?: string; date?: string; createdAt?: string }>(
  local: T[],
  incoming: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of incoming) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const a = entityStamp(prev);
    const b = entityStamp(item);
    if (!a && !b) map.set(item.id, item);
    else if (b >= a) map.set(item.id, item);
  }
  return Array.from(map.values());
}

export function emptyPufomGeometry(farmId: string): PufomGeometry {
  return {
    blocks: [],
    pins: [],
    tracks: [],
    viewport: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function mergePufomBundles(local: PufomBundleV1, incoming: PufomBundleV1): PufomBundleV1 {
  if (local.farmId !== incoming.farmId) {
    throw new Error('Cannot merge .pufom bundles from different farms.');
  }
  const gLocal = local.geometry;
  const gIn = incoming.geometry;
  const geoUpdated =
    (gIn.updatedAt || '') >= (gLocal.updatedAt || '') ? gIn.updatedAt : gLocal.updatedAt;
  return {
    format: PUFOM_FORMAT,
    version: PUFOM_VERSION,
    farmId: local.farmId,
    farmName: incoming.farmName || local.farmName,
    exportedAt: new Date().toISOString(),
    deviceLabel: local.deviceLabel,
    geometry: {
      blocks: mergeByLww(gLocal.blocks as PufomEntity[], gIn.blocks as PufomEntity[]),
      pins: mergeByLww(gLocal.pins as PufomEntity[], gIn.pins as PufomEntity[]),
      tracks: mergeByLww(gLocal.tracks as PufomEntity[], gIn.tracks as PufomEntity[]),
      viewport:
        (gIn.updatedAt || '') >= (gLocal.updatedAt || '')
          ? gIn.viewport ?? gLocal.viewport
          : gLocal.viewport ?? gIn.viewport,
      updatedAt: geoUpdated || new Date().toISOString(),
    },
    issues: mergeByLww(local.issues, incoming.issues),
    issuesArchive: mergeByLww(local.issuesArchive, incoming.issuesArchive),
    diary: mergeByLww(local.diary, incoming.diary),
  };
}
