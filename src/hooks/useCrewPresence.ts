/**
 * Publish own GPS to farm presence + subscribe to other crew while Farm Map is open.
 * Cloud (Firestore) + LAN hub (Express) — merge by freshest updatedAt.
 * Maintains a 2-minute bread-trail ring buffer on publish.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserGeoFix } from '../components/map/UserLocationLayer';
import {
  clearCrewPresence,
  ensureShareCrewLocationDefault,
  getShareCrewLocation,
  isPresenceFresh,
  PRESENCE_UPSERT_MS,
  setShareCrewLocation,
  subscribeFarmPresence,
  upsertCrewPresence,
  type CrewPresenceDoc,
  type TrailPoint,
} from '../lib/crewPresence';
import { appendTrailPoint, pruneTrail } from '../lib/breadTrails';
import {
  clearLanPresence,
  fetchLanPresence,
  mergePresenceByUid,
  PRESENCE_LAN_POLL_MS,
  upsertLanPresence,
} from '../lib/lanPresence';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';

/** Invalidate delayed clears across Strict Mode remounts. */
let presenceClearEpoch = 0;

type Opts = {
  farmId: string | null | undefined;
  uid: string | null | undefined;
  displayName?: string | null;
  fix: UserGeoFix | null;
  /** Map page mounted */
  enabled?: boolean;
};

export function useCrewPresence({
  farmId,
  uid,
  displayName,
  fix,
  enabled = true,
}: Opts): {
  others: CrewPresenceDoc[];
  /** Own recent trail points (local ring buffer). */
  selfTrail: TrailPoint[];
  sharing: boolean;
  setSharing: (on: boolean) => void;
  nearbyCount: number;
  /** For map chrome: why am I not visible to others? */
  publishStatus: 'off' | 'no-gps' | 'error' | 'live' | 'idle';
  lastError: string | null;
} {
  const [others, setOthers] = useState<CrewPresenceDoc[]>([]);
  const [selfTrail, setSelfTrail] = useState<TrailPoint[]>([]);
  const [sharing, setSharingState] = useState(() => getShareCrewLocation());
  const [lastError, setLastError] = useState<string | null>(null);
  const [publishedOnce, setPublishedOnce] = useState(false);
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const trailRef = useRef<TrailPoint[]>([]);

  const cloudRef = useRef<CrewPresenceDoc[]>([]);
  const lanRef = useRef<CrewPresenceDoc[]>([]);

  const applyMerged = useCallback(
    (selfUid: string | null | undefined) => {
      const now = Date.now();
      const fresh = (list: CrewPresenceDoc[]) =>
        list
          .filter((d) => isPresenceFresh(d.updatedAt, now))
          .map((d) => ({ ...d, trail: pruneTrail(d.trail, now) }));
      const merged = mergePresenceByUid(
        fresh(cloudRef.current),
        fresh(lanRef.current)
      ).filter((d) => d.uid !== selfUid);
      setOthers(merged);
    },
    []
  );

  useEffect(() => {
    if (!uid) return;
    void ensureShareCrewLocationDefault().then((v) => setSharingState(v));
  }, [uid]);

  const setSharing = useCallback((on: boolean) => {
    setShareCrewLocation(on);
    setSharingState(on);
    if (on) setLastError(null);
    if (!on) {
      trailRef.current = [];
      setSelfTrail([]);
    }
  }, []);

  // Keep local trail from GPS even for “Mine” when sharing (publish also uses it)
  useEffect(() => {
    if (!enabled || !fix) return;
    const next = appendTrailPoint(trailRef.current, fix.lat, fix.lng, Date.now());
    trailRef.current = next;
    setSelfTrail(next);
  }, [enabled, fix?.lat, fix?.lng, fix?.accuracyM]);

  // Cloud subscribe + LAN poll → merge
  useEffect(() => {
    if (!enabled || !farmId || isLocalOnlyFarmSession()) {
      cloudRef.current = [];
      lanRef.current = [];
      setOthers([]);
      return;
    }

    const unsub = subscribeFarmPresence(
      farmId,
      (docs) => {
        cloudRef.current = docs;
        applyMerged(uid);
      },
      (err) => {
        // Cloud may be down — LAN poll can still serve presence.
        console.warn('[useCrewPresence] cloud subscribe', err.message);
      }
    );

    let cancelled = false;
    const pollLan = () => {
      if (cancelled) return;
      void fetchLanPresence(farmId)
        .then((docs) => {
          if (cancelled) return;
          lanRef.current = docs;
          applyMerged(uid);
        })
        .catch((err) => {
          // Hub unreachable is normal when not on workshop LAN.
          if (import.meta.env.DEV) {
            console.debug('[useCrewPresence] LAN poll', err);
          }
        });
    };
    pollLan();
    const timer = setInterval(pollLan, PRESENCE_LAN_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      unsub();
    };
  }, [enabled, farmId, uid, applyMerged]);

  // Publish own location while sharing (cloud when online + always try LAN)
  useEffect(() => {
    if (!enabled || !farmId || !uid || !sharing || isLocalOnlyFarmSession()) {
      return;
    }

    presenceClearEpoch += 1;
    const myEpoch = presenceClearEpoch;

    let cancelled = false;
    setPublishedOnce(false);

    const publish = () => {
      if (cancelled) return;
      const f = fixRef.current;
      if (!f) return;

      const trail = pruneTrail(trailRef.current);
      trailRef.current = trail;
      setSelfTrail(trail);

      const payload = {
        uid,
        displayName: displayName || 'Crew',
        lat: f.lat,
        lng: f.lng,
        accuracyM: f.accuracyM,
        heading: f.heading,
        trail,
        kind: 'person' as const,
      };

      const tasks: Promise<void>[] = [];

      if (typeof navigator === 'undefined' || navigator.onLine) {
        tasks.push(upsertCrewPresence(farmId, payload));
      }
      tasks.push(upsertLanPresence(farmId, payload));

      void Promise.allSettled(tasks).then((results) => {
        if (cancelled) return;
        const anyOk = results.some((r) => r.status === 'fulfilled');
        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
        if (anyOk) {
          setPublishedOnce(true);
          setLastError(null);
        } else if (errors.length) {
          setLastError(errors[0] || 'Presence publish failed');
        }
      });
    };

    publish();
    const timer = setInterval(publish, PRESENCE_UPSERT_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      const farm = farmId;
      const user = uid;
      const epochAtSchedule = myEpoch;
      window.setTimeout(() => {
        if (presenceClearEpoch === epochAtSchedule) {
          void clearCrewPresence(farm, user);
          void clearLanPresence(farm, user);
        }
      }, 500);
    };
  }, [enabled, farmId, uid, displayName, sharing]);

  // Publish as soon as GPS arrives
  useEffect(() => {
    if (!enabled || !farmId || !uid || !sharing || !fix || isLocalOnlyFarmSession()) return;

    const trail = pruneTrail(
      appendTrailPoint(trailRef.current, fix.lat, fix.lng, Date.now())
    );
    trailRef.current = trail;
    setSelfTrail(trail);

    const payload = {
      uid,
      displayName: displayName || 'Crew',
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      heading: fix.heading,
      trail,
      kind: 'person' as const,
    };

    const tasks: Promise<void>[] = [];
    if (typeof navigator === 'undefined' || navigator.onLine) {
      tasks.push(upsertCrewPresence(farmId, payload));
    }
    tasks.push(upsertLanPresence(farmId, payload));

    void Promise.allSettled(tasks).then((results) => {
      const anyOk = results.some((r) => r.status === 'fulfilled');
      if (anyOk) {
        setPublishedOnce(true);
        setLastError(null);
      }
    });
  }, [enabled, farmId, uid, displayName, sharing, fix?.lat, fix?.lng]);

  // Clear when share turned off
  useEffect(() => {
    if (sharing || !farmId || !uid || isLocalOnlyFarmSession()) return;
    presenceClearEpoch += 1;
    void clearCrewPresence(farmId, uid);
    void clearLanPresence(farmId, uid);
    setPublishedOnce(false);
  }, [sharing, farmId, uid]);

  let publishStatus: 'off' | 'no-gps' | 'error' | 'live' | 'idle' = 'idle';
  if (!sharing) publishStatus = 'off';
  else if (lastError) publishStatus = 'error';
  else if (!fix) publishStatus = 'no-gps';
  else if (publishedOnce) publishStatus = 'live';
  else publishStatus = 'idle';

  return {
    others,
    selfTrail,
    sharing,
    setSharing,
    nearbyCount: others.length,
    publishStatus,
    lastError,
  };
}
