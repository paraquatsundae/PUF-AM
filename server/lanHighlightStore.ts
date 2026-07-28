/**
 * In-memory timed map-highlight shelf for workshop LAN hub.
 */

export type LanHighlightEntry = {
  id: string;
  geojson: unknown;
  createdBy: string;
  displayName: string;
  colour?: string;
  note?: string;
  audience: 'all' | string[];
  expiresAt: string;
  createdAt: string;
};

/** farmId → id → entry */
const shelf = new Map<string, Map<string, LanHighlightEntry>>();

export function upsertLanHighlight(farmId: string, entry: LanHighlightEntry): void {
  let farm = shelf.get(farmId);
  if (!farm) {
    farm = new Map();
    shelf.set(farmId, farm);
  }
  farm.set(entry.id, entry);
}

export function clearLanHighlight(farmId: string, id: string): void {
  shelf.get(farmId)?.delete(id);
}

export function listLanHighlights(farmId: string, nowMs = Date.now()): LanHighlightEntry[] {
  const farm = shelf.get(farmId);
  if (!farm) return [];
  const out: LanHighlightEntry[] = [];
  for (const [id, entry] of farm) {
    const t = Date.parse(entry.expiresAt);
    if (!Number.isFinite(t) || t <= nowMs) {
      farm.delete(id);
      continue;
    }
    out.push(entry);
  }
  return out;
}
