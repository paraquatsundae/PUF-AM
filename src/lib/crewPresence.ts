/**
 * Farm Map crew presence — live GPS docs at farms/{farmId}/presence/{uid}.
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isWorkshopMode } from './workshopMode';

export const PRESENCE_STALE_MS = 45_000;
export const PRESENCE_UPSERT_MS = 8_000;
export const SHARE_CREW_LOCATION_KEY = 'pufom_share_crew_location';
const DEVICE_ID_KEY = 'pufom_presence_device_id';

export type CrewPresenceDoc = {
  uid: string;
  displayName: string;
  lat: number;
  lng: number;
  accuracyM: number;
  heading?: number | null;
  updatedAt: string;
  deviceId: string;
  source: 'gps';
};

export function isPresenceFresh(
  updatedAt: string | undefined,
  nowMs: number = Date.now(),
  staleMs: number = PRESENCE_STALE_MS
): boolean {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return false;
  return nowMs - t <= staleMs;
}

/** Stable HSL colour for a crew marker from uid. */
export function presenceColourForUid(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) {
    h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 55% 42%)`;
}

export function getPresenceDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'unknown';
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

/** Sync read — uses stored preference; unset → false until ensureShareDefault runs. */
export function getShareCrewLocation(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const v = localStorage.getItem(SHARE_CREW_LOCATION_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return false;
  } catch {
    return false;
  }
}

export function setShareCrewLocation(share: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SHARE_CREW_LOCATION_KEY, share ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * First-run default: on for workshop / invite PIN; off for Google production users.
 * Only writes when the key is unset — and only after auth is available
 * (otherwise we'd permanently stamp "off" before the PIN token loads).
 */
export async function ensureShareCrewLocationDefault(): Promise<boolean> {
  if (typeof localStorage === 'undefined') return false;
  try {
    const existing = localStorage.getItem(SHARE_CREW_LOCATION_KEY);
    if (existing === '1' || existing === '0') return existing === '1';
  } catch {
    /* fall through */
  }

  if (isWorkshopMode()) {
    setShareCrewLocation(true);
    return true;
  }

  const user = auth.currentUser;
  if (!user) {
    // Don't persist yet — caller will re-run once uid is known.
    return false;
  }

  let defaultOn = false;
  try {
    const token = await user.getIdTokenResult();
    defaultOn = token.claims.pinAuth === true;
  } catch {
    defaultOn = false;
  }
  setShareCrewLocation(defaultOn);
  return defaultOn;
}

export async function upsertCrewPresence(
  farmId: string,
  payload: Omit<CrewPresenceDoc, 'source' | 'deviceId' | 'updatedAt'> & {
    accuracyM?: number;
    heading?: number | null;
  }
): Promise<void> {
  if (!farmId || !payload.uid) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const accuracyM =
    typeof payload.accuracyM === 'number' && Number.isFinite(payload.accuracyM)
      ? payload.accuracyM
      : 0;
  const heading =
    typeof payload.heading === 'number' && Number.isFinite(payload.heading)
      ? payload.heading
      : null;

  const docPayload: CrewPresenceDoc = {
    uid: payload.uid,
    displayName: (payload.displayName || 'Crew').slice(0, 100),
    lat: payload.lat,
    lng: payload.lng,
    accuracyM,
    heading,
    updatedAt: new Date().toISOString(),
    deviceId: getPresenceDeviceId(),
    source: 'gps',
  };

  await setDoc(doc(db, `farms/${farmId}/presence`, payload.uid), docPayload, { merge: true });
}

export async function clearCrewPresence(farmId: string, uid: string): Promise<void> {
  if (!farmId || !uid) return;
  try {
    await deleteDoc(doc(db, `farms/${farmId}/presence`, uid));
  } catch (err) {
    console.warn('[crewPresence] clear failed', err);
  }
}

export function subscribeFarmPresence(
  farmId: string,
  onChange: (docs: CrewPresenceDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const ref = collection(db, `farms/${farmId}/presence`);
  return onSnapshot(
    ref,
    (snap) => {
      const now = Date.now();
      const docs: CrewPresenceDoc[] = [];
      snap.forEach((d) => {
        const data = d.data() as CrewPresenceDoc;
        if (!isPresenceFresh(data.updatedAt, now)) return;
        docs.push({ ...data, uid: data.uid || d.id });
      });
      onChange(docs);
    },
    (err) => {
      console.warn('[crewPresence] subscribe failed', err);
      onError?.(err);
    }
  );
}

export function secondsAgoLabel(updatedAt: string, nowMs: number = Date.now()): string {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 'just now';
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}
