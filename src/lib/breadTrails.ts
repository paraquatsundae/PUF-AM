/**
 * Short bread-trail helpers for crew presence (last 2 minutes).
 */
export const TRAIL_WINDOW_MS = 120_000;

export type TrailPoint = {
  lat: number;
  lng: number;
  /** Epoch ms */
  t: number;
};

export type BreadTrailPrefs = {
  /** Own trail — default ON */
  showMine: boolean;
  /** Vehicle / machine trails — default ON */
  showMachines: boolean;
  /** Other people — admin-gated; default OFF */
  showEveryone: boolean;
};

export const BREAD_TRAIL_PREFS_KEY = 'pufom_bread_trail_prefs';

export const DEFAULT_BREAD_TRAIL_PREFS: BreadTrailPrefs = {
  showMine: true,
  showMachines: true,
  showEveryone: false,
};

export function pruneTrail(
  trail: TrailPoint[] | undefined,
  nowMs: number = Date.now(),
  windowMs: number = TRAIL_WINDOW_MS
): TrailPoint[] {
  if (!trail?.length) return [];
  return trail.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Number.isFinite(p.t) &&
      nowMs - p.t <= windowMs
  );
}

export function appendTrailPoint(
  trail: TrailPoint[] | undefined,
  lat: number,
  lng: number,
  t: number = Date.now(),
  windowMs: number = TRAIL_WINDOW_MS
): TrailPoint[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return pruneTrail(trail, t, windowMs);
  }
  const prev = pruneTrail(trail, t, windowMs);
  const last = prev[prev.length - 1];
  // Skip near-duplicates (< ~2 m within 100 ms) so rapid GPS callbacks aren’t over-filtered;
  // stationary idle still doesn’t fill the buffer. Publish stays at 500 ms.
  if (last && t - last.t < 100) {
    const dLat = lat - last.lat;
    const dLng = lng - last.lng;
    if (dLat * dLat + dLng * dLng < 3e-10) {
      return prev;
    }
  }
  return [...prev, { lat, lng, t }];
}

export function trailOpacityAt(ageMs: number, windowMs: number = TRAIL_WINDOW_MS): number {
  if (ageMs <= 0) return 0.9;
  if (ageMs >= windowMs) return 0;
  return Math.max(0, 0.9 * (1 - ageMs / windowMs));
}

/** Stub: explicit kind, or speed ≥ 4 m/s (~14 km/h). */
export function isVehiclePresence(p: {
  kind?: string | null;
  speedMps?: number | null;
}): boolean {
  if (p.kind === 'vehicle') return true;
  if (typeof p.speedMps === 'number' && Number.isFinite(p.speedMps) && p.speedMps >= 4) {
    return true;
  }
  return false;
}

export function readBreadTrailPrefs(): BreadTrailPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_BREAD_TRAIL_PREFS };
  try {
    const raw = localStorage.getItem(BREAD_TRAIL_PREFS_KEY);
    if (!raw) return { ...DEFAULT_BREAD_TRAIL_PREFS };
    const parsed = JSON.parse(raw) as Partial<BreadTrailPrefs>;
    return {
      showMine: parsed.showMine !== false,
      showMachines: parsed.showMachines !== false,
      showEveryone: parsed.showEveryone === true,
    };
  } catch {
    return { ...DEFAULT_BREAD_TRAIL_PREFS };
  }
}

export function writeBreadTrailPrefs(prefs: BreadTrailPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BREAD_TRAIL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Only admin may enable “everyone”; farmers/viewers keep showEveryone false. */
export function canEnableEveryoneTrails(role: string | null | undefined): boolean {
  return role === 'admin';
}
