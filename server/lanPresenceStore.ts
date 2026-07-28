/**
 * In-memory crew presence shelf for workshop LAN hub (CREW_PRESENCE P2).
 * Survives only while the Express process is up — fine for same-WiFi fallback.
 */

export type LanTrailPoint = { lat: number; lng: number; t: number };

export type LanPresenceEntry = {
  uid: string;
  displayName: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  kind?: 'person' | 'vehicle';
  trail?: LanTrailPoint[];
  updatedAt: string;
  source: 'gps' | 'manual';
};

const STALE_MS = 45_000;

/** farmId → uid → entry */
const shelf = new Map<string, Map<string, LanPresenceEntry>>();

export function upsertLanPresence(farmId: string, entry: LanPresenceEntry): void {
  let farm = shelf.get(farmId);
  if (!farm) {
    farm = new Map();
    shelf.set(farmId, farm);
  }
  farm.set(entry.uid, entry);
}

export function clearLanPresence(farmId: string, uid: string): void {
  shelf.get(farmId)?.delete(uid);
}

export function listLanPresence(farmId: string, nowMs = Date.now()): LanPresenceEntry[] {
  const farm = shelf.get(farmId);
  if (!farm) return [];
  const out: LanPresenceEntry[] = [];
  for (const [uid, entry] of farm) {
    const t = Date.parse(entry.updatedAt);
    if (!Number.isFinite(t) || nowMs - t > STALE_MS) {
      farm.delete(uid);
      continue;
    }
    out.push(entry);
  }
  return out;
}
