/**
 * Workshop LAN crew presence via Express hub (CREW_PRESENCE P2).
 * Uses the same sync peer base as .pufom LAN sync.
 */
import { auth } from '../firebase';
import { type CrewPresenceDoc } from './crewPresence';
import { syncApiUrl } from './mdnsPeers';

export const PRESENCE_LAN_POLL_MS = 5_000;

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function upsertLanPresence(
  farmId: string,
  payload: {
    uid: string;
    displayName: string;
    lat: number;
    lng: number;
    accuracyM?: number;
    heading?: number | null;
  }
): Promise<void> {
  if (!farmId || !payload.uid) return;
  const headers = await authHeaders();
  const res = await fetch(syncApiUrl(`/api/presence/${encodeURIComponent(farmId)}`), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      displayName: payload.displayName,
      lat: payload.lat,
      lng: payload.lng,
      accuracyM: payload.accuracyM ?? null,
      headingDeg: payload.heading ?? null,
      source: 'gps',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `LAN presence upsert ${res.status}`);
  }
}

export async function clearLanPresence(farmId: string, _uid: string): Promise<void> {
  if (!farmId) return;
  try {
    const headers = await authHeaders();
    const res = await fetch(syncApiUrl(`/api/presence/${encodeURIComponent(farmId)}/me`), {
      method: 'DELETE',
      headers,
    });
    if (!res.ok && res.status !== 401) {
      console.warn('[lanPresence] clear failed', res.status);
    }
  } catch (err) {
    console.warn('[lanPresence] clear failed', err);
  }
}

export async function fetchLanPresence(farmId: string): Promise<CrewPresenceDoc[]> {
  if (!farmId) return [];
  const headers = await authHeaders();
  const res = await fetch(syncApiUrl(`/api/presence/${encodeURIComponent(farmId)}`), {
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `LAN presence fetch ${res.status}`);
  }
  const data = (await res.json()) as {
    entries?: Array<{
      uid: string;
      displayName: string;
      lat: number;
      lng: number;
      accuracyM: number | null;
      headingDeg: number | null;
      updatedAt: string;
      source?: string;
    }>;
  };
  return (data.entries || []).map((e) => ({
    uid: e.uid,
    displayName: e.displayName || 'Crew',
    lat: e.lat,
    lng: e.lng,
    accuracyM: typeof e.accuracyM === 'number' ? e.accuracyM : 0,
    heading: e.headingDeg,
    updatedAt: e.updatedAt,
    // Hub has no per-device id; merge keys on uid.
    deviceId: `lan:${e.uid}`,
    source: 'gps' as const,
  }));
}

/** Prefer freshest updatedAt per uid. */
export function mergePresenceByUid(
  ...lists: CrewPresenceDoc[][]
): CrewPresenceDoc[] {
  const byUid = new Map<string, CrewPresenceDoc>();
  for (const list of lists) {
    for (const doc of list) {
      if (!doc?.uid) continue;
      const prev = byUid.get(doc.uid);
      if (!prev) {
        byUid.set(doc.uid, doc);
        continue;
      }
      const prevT = Date.parse(prev.updatedAt) || 0;
      const nextT = Date.parse(doc.updatedAt) || 0;
      if (nextT >= prevT) byUid.set(doc.uid, doc);
    }
  }
  return [...byUid.values()];
}
