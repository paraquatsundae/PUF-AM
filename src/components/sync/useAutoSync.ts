/**
 * The controller behind **Sync now** — probe the conditions, run the ladder.
 *
 * `src/lib/autoSync.ts` decides *what should happen*; this decides *what is
 * true* and then does it. The split is so the ladder can be tested without a
 * network, a Freenet node or a browser.
 *
 * Two rules it exists to enforce:
 *
 * - **Only the Wi‑Fi rungs run unattended.** Both merge last-writer-wins, both
 *   are seconds, and both are a no-op when nothing changed. A Freenet publish is
 *   minutes through a laptop-only binary and re-issues the join ticket; a
 *   Freenet pull replaces local records instead of merging them. Neither belongs
 *   on a timer, so both wait for a press.
 * - **No storms.** One attempt at a time, a floor between attempts that a wake,
 *   a tab switch and a Wi‑Fi reconnect all have to clear, and a content digest
 *   so an untouched farm re-uploads nothing.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../firebase';
import { apiFetch } from '../../lib/apiBase';
import {
  AUTO_SYNC_INTERVAL_MS,
  autoSyncEnabled,
  planFarmSync,
  readLastSync,
  setAutoSyncEnabled,
  shouldAutoSyncNow,
  writeLastSync,
  type FreenetNodeState,
  type LastSyncEntry,
  type SyncConditions,
  type SyncPeerState,
  type SyncPlan,
} from '../../lib/autoSync';
import { activeFarmPipe } from '../../lib/farmPipes';
import { syncApiUrl } from '../../lib/mdnsPeers';
import { ensureSyncHub } from '../../lib/syncHub';
import {
  canReachFreenetNode,
  detectFreenetReadOnly,
  refreshFreenetRuntime,
} from '../../lib/freenetRuntime';
import { pullLanBundle, pushLanBundle } from '../../lib/pufomSync';
import { getLastFarm } from '../../lib/deviceSession';
import { findJoinPreset } from '../../../shared/sync/joinGrant';
import { isMistHotMirrorAvailable } from '../../mist/mistHotBridge';
import { getMistHotPublishStatus } from '../../mist/mistHotPublishMeta';
import { syncSealedFarmOverLan } from '../../mist/mistLanShelf';
import { publishFarmToFreenet } from '../../mist/mistFreenetClient';
import {
  fetchAndRehydrateFarmFromAddresses,
  refreshFarmUiAfterRecovery,
} from '../../mist/mistDisasterRecovery';

/**
 * Is another PUF-AM serving on this network?
 *
 * `/api/health` rather than anything farm-shaped: it is the one route every hub
 * answers without a credential, which is exactly the question being asked. On a
 * laptop the answer is normally "yes, itself" — that is not a trick, it is the
 * mesh working. The shelf that laptop writes to is the same one its LAN listener
 * serves to the tablet, so pushing to itself is how the farm becomes available
 * to everything else in the shed.
 */
async function probeSyncPeer(): Promise<SyncPeerState> {
  let remote = false;
  try {
    const resolution = await ensureSyncHub();
    if (resolution.needsPairing) return 'needs-pairing';
    // The ladder has already preferred this Wi‑Fi and only fallen through to the
    // gateway if nothing was here, so this is a report rather than a choice.
    remote = resolution.source === 'gateway';
  } catch {
    /* Discovery is a convenience; the health probe below is the real answer. */
  }
  try {
    const res = await apiFetch(syncApiUrl('/api/health'), { timeoutMs: 6000 });
    if (!res.ok) return 'none';
    return remote ? 'reachable-remote' : 'reachable';
  } catch {
    return 'none';
  }
}

async function probeFreenet(): Promise<FreenetNodeState> {
  const runtime = await refreshFreenetRuntime().catch(() => null);
  if (!runtime || !canReachFreenetNode(runtime)) return 'none';
  return detectFreenetReadOnly(runtime) ? 'read-only' : 'publish';
}

function readConditions(peer: SyncPeerState, freenet: FreenetNodeState): SyncConditions {
  return {
    pipe: activeFarmPipe(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    farmUnlocked: isMistHotMirrorAvailable(),
    cloudSignedIn: Boolean(auth.currentUser),
    peer,
    freenet,
  };
}

function countsLine(counts: {
  diary: number;
  blocks: number;
  issues: number;
}): string {
  return `${counts.diary} diary · ${counts.blocks} blocks · ${counts.issues} issues`;
}

export type AutoSyncState = {
  farmId: string;
  plan: SyncPlan;
  last: LastSyncEntry | null;
  busy: boolean;
  /** True until the first probe answers, so the card does not flash "waiting". */
  settling: boolean;
  autoEnabled: boolean;
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
    void Promise.all([probeSyncPeer(), probeFreenet()]).then(([nextPeer, nextFreenet]) => {
      setPeer(nextPeer);
      setFreenet(nextFreenet);
      setSettling(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const plan = settling ? SETTLING_PLAN : planFarmSync(readConditions(peer, freenet));

  const record = useCallback(
    (farm: string, entry: LastSyncEntry) => {
      writeLastSync(farm, entry);
      setLast(entry);
    },
    [],
  );

  /**
   * Run whichever rung the ladder picked.
   *
   * `manual` is not a permission — a rung that says `auto: false` is never
   * reached from the timer at all — it only decides whether a failure is worth
   * writing down. An automatic attempt that finds the laptop asleep is not news;
   * the same failure after a press is the answer to a question.
   */
  const run = useCallback(
    async (manual: boolean) => {
      if (!farmId || runningRef.current) return;
      const current = planFarmSync(readConditions(peer, freenet));
      if (current.route === 'blocked') return;

      runningRef.current = true;
      setBusy(true);
      lastAttemptAt.current = Date.now();
      const farmName = getLastFarm()?.farmName;

      try {
        let summary = '';

        if (current.route === 'lan-sealed') {
          const result = await syncSealedFarmOverLan(farmId, { farmName });
          if (result.pulled) {
            await refreshFarmUiAfterRecovery(farmId);
            summary = countsLine({
              diary: result.pulled.applied.diary,
              blocks: result.pulled.applied.blocks,
              issues: result.pulled.applied.issues,
            });
          } else if (result.alreadyCurrent) {
            summary = 'already up to date';
          } else {
            summary = `sent ${Math.round((result.pushed?.bytes ?? 0) / 1024)} KB to the shed`;
          }
        } else if (current.route === 'lan-pufom') {
          const pulled = await pullLanBundle(farmId);
          await pushLanBundle(farmId, farmName);
          if (pulled) {
            await refreshFarmUiAfterRecovery(farmId);
            summary = countsLine({
              diary: pulled.diary,
              blocks: pulled.blocks,
              issues: pulled.issues,
            });
          } else {
            summary = 'shelf was empty — this device filled it';
          }
        } else if (current.route === 'freenet-publish') {
          // The grant this farm last handed out, not a fresh guess: re-sending
          // mints a new ticket, and one that quietly widened or narrowed what it
          // grants would be worse than asking.
          const status = getMistHotPublishStatus(farmId);
          const preset = findJoinPreset(status?.joinTicketPreset);
          if (!status?.freenetUri && !preset) {
            throw new Error(
              'This farm has not been sent over Freenet from this device yet — use “Send or ' +
                'join a farm over Freenet” below to choose what the join ticket grants.',
            );
          }
          const result = await publishFarmToFreenet(farmId, preset ? { preset } : {});
          summary = result.shortTicket
            ? `sent — join ticket ${result.shortTicket}`
            : 'sent, but no short join ticket could be published';
        } else if (current.route === 'freenet-pull') {
          const status = getMistHotPublishStatus(farmId);
          if (!status?.freenetUri || !status.bonesFreenetUri) {
            throw new Error(
              'This device has no Freenet address for the farm yet. Join with a ticket once ' +
                'under “Send or join a farm over Freenet” below, and pulling works from then on.',
            );
          }
          const result = await fetchAndRehydrateFarmFromAddresses(farmId, {
            hotUri: status.freenetUri,
            bonesUri: status.bonesFreenetUri,
            hotContentHash: status.contentHash,
            bonesContentHash: status.bonesContentHash,
          });
          await refreshFarmUiAfterRecovery(farmId);
          summary = countsLine({
            diary: result.hot.after.diary,
            blocks: result.geometry.after.blocks,
            issues: result.hot.after.issues,
          });
        }

        record(farmId, {
          at: new Date().toISOString(),
          via: current.via,
          ok: true,
          summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (manual) {
          record(farmId, {
            at: new Date().toISOString(),
            via: current.via,
            ok: false,
            summary: message,
          });
        }
      } finally {
        runningRef.current = false;
        setBusy(false);
        refresh();
      }
    },
    [farmId, freenet, peer, record, refresh],
  );

  // Automatic attempts: the timer, plus the three things that mean "this device
  // just rejoined the world". All of them go through the same floor, so a tablet
  // waking on the shed Wi‑Fi syncs once rather than three times.
  useEffect(() => {
    if (!farmId) return;

    const attempt = (trigger: 'timer' | 'resume') => {
      const conditions = readConditions(peer, freenet);
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
    syncNow: () => void run(true),
    setAuto,
    refresh,
  };
}
