/**
 * Timed “check this” area highlights on the Farm Map.
 * Cloud: farms/{farmId}/mapHighlights/{id}
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { presenceColourForUid } from './crewPresence';

export const HIGHLIGHT_DEFAULT_SECONDS = 30;
export const HIGHLIGHT_DURATION_PRESETS_SEC = [30, 60, 120, 300] as const;
export const HIGHLIGHT_MAX_SECONDS = 600;
export const HIGHLIGHT_MAX_NOTE = 280;

export type MapHighlightAudience = 'all' | string[];

export type MapHighlightDoc = {
  id: string;
  geojson: GeoJSON.Feature | GeoJSON.Geometry;
  createdBy: string;
  displayName: string;
  /** Author presence colour (derived client-side if omitted). */
  colour?: string;
  note?: string;
  audience: MapHighlightAudience;
  expiresAt: string;
  createdAt: string;
};

export function highlightColourForAuthor(uid: string, stored?: string): string {
  if (stored && typeof stored === 'string' && stored.length > 0) return stored;
  return presenceColourForUid(uid);
}

export function isHighlightActive(
  expiresAt: string | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t > nowMs;
}

export function resolveHighlightDurationSeconds(opts: {
  role: 'admin' | 'farmer' | 'viewer' | string | undefined;
  farmDefaultSeconds?: number | null;
  chosenSeconds?: number | null;
}): number {
  const farmDefault =
    typeof opts.farmDefaultSeconds === 'number' &&
    Number.isFinite(opts.farmDefaultSeconds) &&
    opts.farmDefaultSeconds > 0
      ? Math.min(HIGHLIGHT_MAX_SECONDS, Math.round(opts.farmDefaultSeconds))
      : HIGHLIGHT_DEFAULT_SECONDS;

  const canChoose = opts.role === 'admin' || opts.role === 'farmer';
  if (!canChoose) return farmDefault;

  if (
    typeof opts.chosenSeconds === 'number' &&
    Number.isFinite(opts.chosenSeconds) &&
    opts.chosenSeconds > 0
  ) {
    return Math.min(HIGHLIGHT_MAX_SECONDS, Math.round(opts.chosenSeconds));
  }
  return farmDefault;
}

export function canDeleteMapHighlight(
  highlight: Pick<MapHighlightDoc, 'createdBy'>,
  uid: string | null | undefined,
  role: string | null | undefined
): boolean {
  if (!uid) return false;
  if (role === 'admin' || role === 'farmer') return true;
  return highlight.createdBy === uid;
}

export function isHighlightVisibleToViewer(
  highlight: Pick<MapHighlightDoc, 'audience'>,
  uid: string | null | undefined
): boolean {
  const aud = highlight.audience;
  if (aud === 'all' || aud == null) return true;
  if (!Array.isArray(aud)) return true;
  if (!uid) return false;
  return aud.includes(uid);
}

function newHighlightId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildMapHighlight(input: {
  geojson: GeoJSON.Feature | GeoJSON.Geometry;
  createdBy: string;
  displayName: string;
  note?: string;
  audience?: MapHighlightAudience;
  durationSeconds: number;
  nowMs?: number;
}): MapHighlightDoc {
  const nowMs = input.nowMs ?? Date.now();
  const durationMs = Math.max(1, input.durationSeconds) * 1000;
  const note = (input.note || '').trim().slice(0, HIGHLIGHT_MAX_NOTE);
  return {
    id: newHighlightId(),
    geojson: input.geojson,
    createdBy: input.createdBy,
    displayName: (input.displayName || 'Crew').slice(0, 100),
    colour: presenceColourForUid(input.createdBy),
    ...(note ? { note } : {}),
    audience: input.audience ?? 'all',
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + durationMs).toISOString(),
  };
}

export async function upsertMapHighlight(
  farmId: string,
  highlight: MapHighlightDoc
): Promise<void> {
  if (!farmId || !highlight.id) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const payload: MapHighlightDoc = {
    ...highlight,
    displayName: (highlight.displayName || 'Crew').slice(0, 100),
    colour: highlightColourForAuthor(highlight.createdBy, highlight.colour),
    note: highlight.note?.trim().slice(0, HIGHLIGHT_MAX_NOTE) || undefined,
  };
  await setDoc(doc(db, `farms/${farmId}/mapHighlights`, highlight.id), payload, {
    merge: true,
  });
}

export async function deleteMapHighlight(farmId: string, id: string): Promise<void> {
  if (!farmId || !id) return;
  try {
    await deleteDoc(doc(db, `farms/${farmId}/mapHighlights`, id));
  } catch (err) {
    console.warn('[mapHighlights] delete failed', err);
  }
}

export function subscribeFarmHighlights(
  farmId: string,
  onChange: (docs: MapHighlightDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const ref = collection(db, `farms/${farmId}/mapHighlights`);
  return onSnapshot(
    ref,
    (snap) => {
      const now = Date.now();
      const docs: MapHighlightDoc[] = [];
      snap.forEach((d) => {
        const data = d.data() as MapHighlightDoc;
        if (!isHighlightActive(data.expiresAt, now)) return;
        docs.push({ ...data, id: data.id || d.id });
      });
      onChange(docs);
    },
    (err) => {
      console.warn('[mapHighlights] subscribe failed', err);
      onError?.(err);
    }
  );
}

/** Prefer freshest createdAt (or expiresAt) per id. */
export function mergeHighlightsById(...lists: MapHighlightDoc[][]): MapHighlightDoc[] {
  const byId = new Map<string, MapHighlightDoc>();
  for (const list of lists) {
    for (const doc of list) {
      if (!doc?.id) continue;
      const prev = byId.get(doc.id);
      if (!prev) {
        byId.set(doc.id, doc);
        continue;
      }
      const prevT = Date.parse(prev.createdAt) || 0;
      const nextT = Date.parse(doc.createdAt) || 0;
      if (nextT >= prevT) byId.set(doc.id, doc);
    }
  }
  return [...byId.values()];
}
