/**
 * Timed “check this” area highlights on the Farm Map.
 * Cloud: farms/{farmId}/mapHighlights/{id}
 * Mist: pufom_farm_local kind `map_highlights` → Hot record `map_highlight`
 *   (Plans/FREENET_OPERATOR_FLOW.md §9.2 — snapshot-on-Send, crew HotKey).
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
import {
  deleteLocalEntity,
  listLocalEntities,
  replaceLocalEntities,
  upsertLocalEntity,
} from './localFarmRepo';

export const HIGHLIGHT_DEFAULT_SECONDS = 30;
/** Freenet Opennet is minutes; 30s expires before the other device can ping. */
export const HIGHLIGHT_FREENET_DEFAULT_SECONDS = 300;
export const HIGHLIGHT_DURATION_PRESETS_SEC = [30, 60, 120, 300] as const;
export const HIGHLIGHT_MAX_SECONDS = 600;
export const HIGHLIGHT_MAX_NOTE = 280;
export const HIGHLIGHT_MAX_DIRECTED_NAME = 100;
/** Window event after a Freenet pull rehydrates local highlights. */
export const MAP_HIGHLIGHTS_CHANGED_EVENT = 'pufam-map-highlights-changed';
export const MAP_HIGHLIGHT_HOT_TYPE = 'map_highlight';

export type MapHighlightAudience = 'all' | string[];

export type MapHighlightDoc = {
  id: string;
  geojson: GeoJSON.Feature | GeoJSON.Geometry;
  createdBy: string;
  displayName: string;
  /** Author presence colour (derived client-side if omitted). */
  colour?: string;
  note?: string;
  /** Who the area is for — display name. Visibility stays `audience`. */
  directedAtName?: string;
  /** Optional uid / ticket id when the picker had one. */
  directedAtUid?: string;
  audience: MapHighlightAudience;
  expiresAt: string;
  createdAt: string;
  updatedAt?: string;
  /** Farm diary work event created with this highlight (popup target). */
  linkedDiaryEventId?: string;
};

export type HighlightComposePayload = {
  note: string;
  durationSeconds: number;
  directedAtName?: string;
  directedAtUid?: string;
};

export function directedAtFields(input: {
  directedAtName?: string | null;
  directedAtUid?: string | null;
}): Pick<MapHighlightDoc, 'directedAtName' | 'directedAtUid'> {
  const name = (input.directedAtName || '').trim().slice(0, HIGHLIGHT_MAX_DIRECTED_NAME);
  const uid = (input.directedAtUid || '').trim().slice(0, 80);
  return {
    ...(name ? { directedAtName: name } : {}),
    ...(uid ? { directedAtUid: uid } : {}),
  };
}

export function notifyMapHighlightsChanged(farmId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MAP_HIGHLIGHTS_CHANGED_EVENT, { detail: { farmId } }));
}

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
  directedAtName?: string;
  directedAtUid?: string;
  durationSeconds: number;
  nowMs?: number;
}): MapHighlightDoc {
  const nowMs = input.nowMs ?? Date.now();
  const durationMs = Math.max(1, input.durationSeconds) * 1000;
  const note = (input.note || '').trim().slice(0, HIGHLIGHT_MAX_NOTE);
  const createdAt = new Date(nowMs).toISOString();
  return {
    id: newHighlightId(),
    geojson: input.geojson,
    createdBy: input.createdBy,
    displayName: (input.displayName || 'Crew').slice(0, 100),
    colour: presenceColourForUid(input.createdBy),
    ...(note ? { note } : {}),
    ...directedAtFields(input),
    audience: input.audience ?? 'all',
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(nowMs + durationMs).toISOString(),
  };
}

export async function listLocalHighlights(farmId: string): Promise<MapHighlightDoc[]> {
  if (!farmId) return [];
  return listLocalEntities<MapHighlightDoc>(farmId, 'map_highlights');
}

export async function upsertLocalHighlight(
  farmId: string,
  highlight: MapHighlightDoc
): Promise<void> {
  if (!farmId || !highlight.id) return;
  await upsertLocalEntity(farmId, 'map_highlights', highlight, { queueCloud: false });
}

export async function deleteLocalHighlight(farmId: string, id: string): Promise<void> {
  if (!farmId || !id) return;
  await deleteLocalEntity(farmId, 'map_highlights', id, { queueCloud: false });
}

export async function replaceLocalHighlights(
  farmId: string,
  highlights: MapHighlightDoc[]
): Promise<void> {
  if (!farmId) return;
  await replaceLocalEntities(farmId, 'map_highlights', highlights);
}

/** Active highlights only — expired rows stay out of the next Hot snapshot. */
export function activeMapHighlights(
  highlights: MapHighlightDoc[],
  nowMs: number = Date.now()
): MapHighlightDoc[] {
  return highlights.filter((h) => h?.id && isHighlightActive(h.expiresAt, nowMs));
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
    ...directedAtFields(highlight),
    updatedAt: highlight.updatedAt || new Date().toISOString(),
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

/** Same visible set — skip React/Leaflet remounts on the 1s expire tick. */
export function sameVisibleHighlights(a: MapHighlightDoc[], b: MapHighlightDoc[]): boolean {
  if (a.length !== b.length) return false;
  const key = (h: MapHighlightDoc) =>
    `${h.id}\0${h.expiresAt}\0${h.note || ''}\0${h.directedAtName || ''}\0${h.linkedDiaryEventId || ''}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((k, i) => k === right[i]);
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
