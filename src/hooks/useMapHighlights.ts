/**
 * Subscribe to timed map highlights (local + cloud + LAN) and create/delete.
 * Local IndexedDB is the Freenet source: saving a highlight publishes Hot and
 * bumps the watch slot. Other terminals ping, then fetch if generation changed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isFreenetFarm } from '../lib/farmPipes';
import {
  HIGHLIGHT_FREENET_DEFAULT_SECONDS,
  buildMapHighlight,
  canDeleteMapHighlight,
  deleteLocalHighlight,
  deleteMapHighlight,
  isHighlightActive,
  isHighlightVisibleToViewer,
  listLocalHighlights,
  MAP_HIGHLIGHTS_CHANGED_EVENT,
  mergeHighlightsById,
  notifyMapHighlightsChanged,
  resolveHighlightDurationSeconds,
  sameVisibleHighlights,
  subscribeFarmHighlights,
  upsertMapHighlight,
  type MapHighlightAudience,
  type MapHighlightDoc,
} from '../lib/mapHighlights';
import { persistHighlightAndDiary, planHighlightDiary } from '../lib/highlightDiary';
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

function scheduleMistHighlightPublish(farmId: string): void {
  void import('../mist/mistHotBridge').then(({ scheduleMistHotAutoPublish }) => {
    scheduleMistHotAutoPublish(farmId);
  });
}

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
    directedAtName?: string;
    directedAtUid?: string;
    durationSeconds?: number | null;
  }) => Promise<MapHighlightDoc | null>;
  removeHighlight: (id: string) => Promise<void>;
  canDelete: (h: MapHighlightDoc) => boolean;
} {
  const [highlights, setHighlights] = useState<MapHighlightDoc[]>([]);
  const cloudRef = useRef<MapHighlightDoc[]>([]);
  const lanRef = useRef<MapHighlightDoc[]>([]);
  const localRef = useRef<MapHighlightDoc[]>([]);

  const applyMerged = useCallback(
    (selfUid: string | null | undefined) => {
      const now = Date.now();
      const fresh = (list: MapHighlightDoc[]) =>
        list
          .filter((d) => isHighlightActive(d.expiresAt, now))
          .filter((d) => isHighlightVisibleToViewer(d, selfUid));
      const next = mergeHighlightsById(
        fresh(localRef.current),
        fresh(cloudRef.current),
        fresh(lanRef.current)
      );
      setHighlights((prev) => (sameVisibleHighlights(prev, next) ? prev : next));
    },
    []
  );

  useEffect(() => {
    if (!enabled || !farmId) {
      cloudRef.current = [];
      lanRef.current = [];
      localRef.current = [];
      setHighlights([]);
      return;
    }

    const skipCloud = isLocalOnlyFarmSession() || isFreenetFarm();
    let cancelled = false;

    const loadLocal = () => {
      void listLocalHighlights(farmId)
        .then((docs) => {
          if (cancelled) return;
          localRef.current = docs;
          applyMerged(uid);
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.debug('[useMapHighlights] local load', err);
          }
        });
    };

    loadLocal();
    const onLocalChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ farmId?: string }>).detail;
      if (detail?.farmId && detail.farmId !== farmId) return;
      loadLocal();
    };
    window.addEventListener(MAP_HIGHLIGHTS_CHANGED_EVENT, onLocalChange);

    let unsub = () => undefined as void;
    if (!skipCloud) {
      unsub = subscribeFarmHighlights(
        farmId,
        (docs) => {
          cloudRef.current = docs;
          applyMerged(uid);
        },
        (err) => {
          console.warn('[useMapHighlights] cloud subscribe', err.message);
        }
      );
    }

    const pollLan = () => {
      if (cancelled || skipCloud) return;
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
    const timer = setInterval(() => {
      pollLan();
      loadLocal();
    }, HIGHLIGHT_LAN_POLL_MS);

    const expireTimer = setInterval(() => applyMerged(uid), 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(expireTimer);
      window.removeEventListener(MAP_HIGHLIGHTS_CHANGED_EVENT, onLocalChange);
      unsub();
    };
  }, [enabled, farmId, uid, applyMerged]);

  const createHighlight = useCallback(
    async (input: {
      geojson: GeoJSON.Feature | GeoJSON.Geometry;
      note?: string;
      audience?: MapHighlightAudience;
      directedAtName?: string;
      directedAtUid?: string;
      durationSeconds?: number | null;
    }) => {
      if (!farmId || !uid) return null;
      const durationSeconds = resolveHighlightDurationSeconds({
        role: role || 'viewer',
        farmDefaultSeconds:
          farmDefaultSeconds ??
          (isFreenetFarm() ? HIGHLIGHT_FREENET_DEFAULT_SECONDS : undefined),
        chosenSeconds: input.durationSeconds,
      });
      const doc = buildMapHighlight({
        geojson: input.geojson,
        createdBy: uid,
        displayName: displayName || 'Crew',
        note: input.note,
        audience: input.audience ?? 'all',
        directedAtName: input.directedAtName,
        directedAtUid: input.directedAtUid,
        durationSeconds,
      });

      const diary = planHighlightDiary(doc);
      const skipCloud = isLocalOnlyFarmSession() || isFreenetFarm();
      const { highlight: stored, diary: savedDiary } = await persistHighlightAndDiary(
        farmId,
        doc,
        diary,
        { queueCloud: !skipCloud }
      );

      localRef.current = mergeHighlightsById(localRef.current, [stored]);
      lanRef.current = mergeHighlightsById(lanRef.current, [stored]);
      applyMerged(uid);
      notifyMapHighlightsChanged(farmId);

      if (savedDiary) {
        const { useFarmDiaryStore } = await import('../lib/farmDiaryStore');
        useFarmDiaryStore.getState().mergeIncoming(farmId, [savedDiary]);
        if (!skipCloud && (typeof navigator === 'undefined' || navigator.onLine)) {
          try {
            const { diaryApi } = await import('../services/api');
            await diaryApi.saveEvent(farmId, savedDiary);
          } catch (err) {
            console.warn('[useMapHighlights] diary cloud save deferred', err);
          }
        }
      }

      scheduleMistHighlightPublish(farmId);

      const tasks: Promise<void>[] = [];
      if (!skipCloud && (typeof navigator === 'undefined' || navigator.onLine)) {
        tasks.push(upsertMapHighlight(farmId, stored));
        tasks.push(upsertLanHighlight(farmId, stored));
      }
      await Promise.allSettled(tasks);
      return stored;
    },
    [farmId, uid, displayName, role, farmDefaultSeconds, applyMerged]
  );

  const removeHighlight = useCallback(
    async (id: string) => {
      if (!farmId || !id) return;
      cloudRef.current = cloudRef.current.filter((h) => h.id !== id);
      lanRef.current = lanRef.current.filter((h) => h.id !== id);
      localRef.current = localRef.current.filter((h) => h.id !== id);
      applyMerged(uid);
      await deleteLocalHighlight(farmId, id);
      notifyMapHighlightsChanged(farmId);
      scheduleMistHighlightPublish(farmId);
      const skipCloud = isLocalOnlyFarmSession() || isFreenetFarm();
      const tasks: Promise<void>[] = [];
      if (!skipCloud && (typeof navigator === 'undefined' || navigator.onLine)) {
        tasks.push(deleteMapHighlight(farmId, id));
        tasks.push(deleteLanHighlight(farmId, id));
      }
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
