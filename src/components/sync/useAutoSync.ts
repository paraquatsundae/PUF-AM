/**
 * The controller behind **Sync now** — probe the conditions, run the ladder.
 *
 * `src/lib/autoSync.ts` decides *what should happen*; `src/lib/runFarmSync.ts`
 * does the I/O. This hook holds the timer, the busy flag, and the card state.
 *
 * Two rules it exists to enforce:
 *
 * - **Wi‑Fi rungs and Freenet watch-pull run unattended.** LAN merges in
 *   seconds. Freenet *Send* remints a join ticket and stays a press. Freenet
 *   *watch* is a cheap slot GET; a yes fetches Hot and merges highlights/diary.
 * - **No storms.** One attempt at a time, a floor between attempts that a wake,
 *   a tab switch and a Wi‑Fi reconnect all have to clear, and a content digest
 *   so an untouched farm re-uploads nothing.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import {
  AUTO_SYNC_INTERVAL_MS,
  autoSyncEnabled,
  planFarmSync,
  readLastSync,
  setAutoSyncEnabled,
  shouldAutoSyncNow,
  type FreenetNodeState,
  type LastSyncEntry,
  type SyncPeerState,
  type SyncPlan,
} from '../../lib/autoSync';
import { activeFarmPipe, hasFreenetPlane } from '../../lib/farmPipes';
import { getLastFarm } from '../../lib/deviceSession';
import { ensureFreenetHostListening } from '../../mist/ensureFreenetHostListening';
import {
  canStartOwnFreenetHost,
  probeFreenet,
  probeSyncPeer,
  readSyncConditions,
  syncFarmNow,
} from '../../lib/runFarmSync';

export type AutoSyncState = {
  farmId: string;
  plan: SyncPlan;
  last: LastSyncEntry | null;
  busy: boolean;
  /** True until the first probe answers, so the card does not flash "waiting". */
  settling: boolean;
  autoEnabled: boolean;
  /**
   * Sync is worth pressing even when the current plan is blocked: this shell
   * can start its own Freenet node, then the ladder will have a Freenet rung.
   */
  canKickFreenet: boolean;
  syncNow: () => void;
  setAuto: (enabled: boolean) => void;
  refresh: () => void;
};

const SETTLING_PLAN: SyncPlan = {
  route: 'blocked',
  via: 'none',
  auto: false,
  label: 'Looking for a way to sync…',
};

export function useAutoSync(): AutoSyncState {
  const { userData } = useAuth();
  const farmId = userData?.farmId || '';

  const [peer, setPeer] = useState<SyncPeerState>('none');
  const [freenet, setFreenet] = useState<FreenetNodeState>('none');
  const [settling, setSettling] = useState(true);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastSyncEntry | null>(null);
  const [autoEnabled, setAutoEnabledState] = useState(() => autoSyncEnabled());

  const lastAttemptAt = useRef<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    setLast(farmId ? readLastSync(farmId) : null);
  }, [farmId]);

  const refresh = useCallback(() => {
    void (async () => {
      if (activeFarmPipe() !== 'cloud') {
        await ensureFreenetHostListening().catch(() => undefined);
      }
      const [nextPeer, nextFreenet] = await Promise.all([probeSyncPeer(), probeFreenet()]);
      setPeer(nextPeer);
      setFreenet(nextFreenet);
      setSettling(false);
    })();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const plan = settling ? SETTLING_PLAN : planFarmSync(readSyncConditions(peer, freenet));
  const canKickFreenet = hasFreenetPlane() && canStartOwnFreenetHost();

  const run = useCallback(
    async (manual: boolean) => {
      if (!farmId || runningRef.current) return;

      runningRef.current = true;
      setBusy(true);
      lastAttemptAt.current = Date.now();

      try {
        const result = await syncFarmNow(farmId, {
          farmName: getLastFarm()?.farmName,
          manual,
        });
        setPeer(result.peer);
        setFreenet(result.freenet);
        setSettling(false);
        setLast(readLastSync(farmId));
      } finally {
        runningRef.current = false;
        setBusy(false);
        refresh();
      }
    },
    [farmId, refresh],
  );

  useEffect(() => {
    if (!farmId) return;

    const attempt = (trigger: 'timer' | 'resume') => {
      const conditions = readSyncConditions(peer, freenet);
      const next = planFarmSync(conditions);
      if (
        shouldAutoSyncNow({
          plan: next,
          enabled: autoEnabled,
          busy: runningRef.current,
          lastAttemptAt: lastAttemptAt.current,
          trigger,
        })
      ) {
        void run(false);
      }
    };

    attempt('timer');
    const timer = setInterval(() => attempt('timer'), AUTO_SYNC_INTERVAL_MS);
    const onResume = () => {
      refresh();
      attempt('resume');
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') onResume();
    };
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [autoEnabled, farmId, freenet, peer, refresh, run]);

  const setAuto = useCallback((enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    setAutoEnabledState(enabled);
  }, []);

  return {
    farmId,
    plan,
    last,
    busy,
    settling,
    autoEnabled,
    canKickFreenet,
    syncNow: () => void run(true),
    setAuto,
    refresh,
  };
}
