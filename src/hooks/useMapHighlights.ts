/**
 * Subscribe to timed map highlights (cloud + LAN) and create/delete.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildMapHighlight,
  canDeleteMapHighlight,
  deleteMapHighlight,
  isHighlightActive,
  isHighlightVisibleToViewer,
  mergeHighlightsById,
  resolveHighlightDurationSeconds,
  subscribeFarmHighlights,
  upsertMapHighlight,
  type MapHighlightAudience,
  type MapHighlightDoc,
} from '../lib/mapHighlights';
import {
  deleteLanHighlight,
  fetchLanHighlights,
  HIGHLIGHT_LAN_POLL_MS,
  upsertLanHighlight,
} from '../lib/lanHighlights';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';

type Opts = {
  farmId: string | null | undefined;
  uid: string | null | undefined;
  displayName?: string | null;
  role?: string | null;
  farmDefaultSeconds?: number | null;
  enabled?: boolean;
};

export function useMapHighlights({
  farmId,
  uid,
  displayName,
  role,
  farmDefaultSeconds,
  enabled = true,
}: Opts): {
  highlights: MapHighlightDoc[];
  createHighlight: (input: {
    geojson: GeoJSON.Feature | GeoJSON.Geometry;
    note?: string;
    audience?: MapHighlightAudience;
    durationSeconds?: number | null;
  }) => Promise<MapHighlightDoc | null>;
  removeHighlight: (id: string) => Promise<void>;
  canDelete: (h: MapHighlightDoc) => boolean;
} {
  const [highlights, setHighlights] = useState<MapHighlightDoc[]>([]);
  const cloudRef = useRef<MapHighlightDoc[]>([]);
  const lanRef = useRef<MapHighlightDoc[]>([]);

  const applyMerged = useCallback(
    (selfUid: string | null | undefined) => {
      const now = Date.now();
      const fresh = (list: MapHighlightDoc[]) =>
        list
          .filter((d) => isHighlightActive(d.expiresAt, now))
          .filter((d) => isHighlightVisibleToViewer(d, selfUid));
      setHighlights(mergeHighlightsById(fresh(cloudRef.current), fresh(lanRef.current)));
    },
    []
  );

  useEffect(() => {
    if (!enabled || !farmId || isLocalOnlyFarmSession()) {
      cloudRef.current = [];
      lanRef.current = [];
      setHighlights([]);
      return;
    }

    const unsub = subscribeFarmHighlights(
      farmId,
      (docs) => {
        cloudRef.current = docs;
        applyMerged(uid);
      },
      (err) => {
        console.warn('[useMapHighlights] cloud subscribe', err.message);
      }
    );

    let cancelled = false;
    const pollLan = () => {
      if (cancelled) return;
      void fetchLanHighlights(farmId)
        .then((docs) => {
          if (cancelled) return;
          lanRef.current = docs;
          applyMerged(uid);
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.debug('[useMapHighlights] LAN poll', err);
          }
        });
    };
    pollLan();
    const timer = setInterval(pollLan, HIGHLIGHT_LAN_POLL_MS);

    // Client-side expiry tick
    const expireTimer = setInterval(() => applyMerged(uid), 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(expireTimer);
      unsub();
    };
  }, [enabled, farmId, uid, applyMerged]);

  const createHighlight = useCallback(
    async (input: {
      geojson: GeoJSON.Feature | GeoJSON.Geometry;
      note?: string;
      audience?: MapHighlightAudience;
      durationSeconds?: number | null;
    }) => {
      if (!farmId || !uid) return null;
      const durationSeconds = resolveHighlightDurationSeconds({
        role: role || 'viewer',
        farmDefaultSeconds,
        chosenSeconds: input.durationSeconds,
      });
      const doc = buildMapHighlight({
        geojson: input.geojson,
        createdBy: uid,
        displayName: displayName || 'Crew',
        note: input.note,
        audience: input.audience ?? 'all',
        durationSeconds,
      });

      // Optimistic local
      lanRef.current = mergeHighlightsById(lanRef.current, [doc]);
      applyMerged(uid);

      const tasks: Promise<void>[] = [];
      if (typeof navigator === 'undefined' || navigator.onLine) {
        tasks.push(upsertMapHighlight(farmId, doc));
      }
      tasks.push(upsertLanHighlight(farmId, doc));
      await Promise.allSettled(tasks);
      return doc;
    },
    [farmId, uid, displayName, role, farmDefaultSeconds, applyMerged]
  );

  const removeHighlight = useCallback(
    async (id: string) => {
      if (!farmId || !id) return;
      cloudRef.current = cloudRef.current.filter((h) => h.id !== id);
      lanRef.current = lanRef.current.filter((h) => h.id !== id);
      applyMerged(uid);
      const tasks: Promise<void>[] = [];
      if (typeof navigator === 'undefined' || navigator.onLine) {
        tasks.push(deleteMapHighlight(farmId, id));
      }
      tasks.push(deleteLanHighlight(farmId, id));
      await Promise.allSettled(tasks);
    },
    [farmId, uid, applyMerged]
  );

  const canDelete = useCallback(
    (h: MapHighlightDoc) => canDeleteMapHighlight(h, uid, role),
    [uid, role]
  );

  return { highlights, createHighlight, removeHighlight, canDelete };
}
