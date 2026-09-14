/**
 * Run one auto-sync plan: probe, then the route `planFarmSync` picked.
 *
 * The ladder stays a pure function in `autoSync.ts`. This file is the I/O —
 * hub health, Freenet host, LAN shelf, Hot/bones — so Settings → Sync and the
 * map "pending" chip share one path. A Freenet farm never flushes geometry to
 * Firestore from here.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */

import { auth } from '../firebase';
import { apiFetch } from './apiBase';
import {
  planFarmSync,
  writeLastSync,
  type FreenetNodeState,
  type LastSyncEntry,
  type SyncConditions,
  type SyncPeerState,
  type SyncPlan,
  type SyncRoute,
} from './autoSync';
import { activeFarmPipe, isCloudMirror } from './farmPipes';
import { getDesktopBridge } from './desktopBridge';
import { isFreenetHostPluginAvailable } from './androidFreenetHost';
import { syncApiUrl } from './mdnsPeers';
import { ensureSyncHub } from './syncHub';
import {
  canReachFreenetNode,
  detectFreenetReadOnly,
  refreshFreenetRuntime,
} from './freenetRuntime';
import { pullLanBundle, pushLanBundle } from './pufomSync';
import { findJoinPreset } from '../../shared/sync/joinGrant';
import { isMistHotMirrorAvailable } from '../mist/mistHotBridge';
import { unlockedFarmSeed } from '../mist/mistFarmSeedCache';
import {
  applyPulledFreenetMirror,
  pollFreenetHotWatch,
  refreshFarmUiAfterHotMerge,
} from '../mist/hotWatchSync';
import { getMistHotPublishStatus } from '../mist/mistHotPublishMeta';
import { syncSealedFarmOverLan } from '../mist/mistLanShelf';
import {
  publishFarmToFreenet,
  pullBonesFromFreenetByUri,
  pullHotFromFreenetByUri,
} from '../mist/mistFreenetClient';
import { refreshFarmUiAfterRecovery } from '../mist/mistDisasterRecovery';
import { ensureFreenetHostListening } from '../mist/ensureFreenetHostListening';

/**
 * Is another PUF-AM serving on this network?
 *
 * `/api/health` rather than anything farm-shaped: it is the one route every hub
 * answers without a credential, which is exactly the question being asked.
 */
export async function probeSyncPeer(): Promise<SyncPeerState> {
  let remote = false;
  try {
    const resolution = await ensureSyncHub();
    if (resolution.needsPairing) return 'needs-pairing';
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

export async function probeFreenet(): Promise<FreenetNodeState> {
  const runtime = await refreshFreenetRuntime().catch(() => null);
  if (!runtime || !canReachFreenetNode(runtime)) return 'none';
  if (detectFreenetReadOnly(runtime)) return 'read-only';
  if (!unlockedFarmSeed()) return 'read-only';
  return 'publish';
}

export function readSyncConditions(peer: SyncPeerState, freenet: FreenetNodeState): SyncConditions {
  return {
    pipe: activeFarmPipe(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    farmUnlocked: isMistHotMirrorAvailable(),
    cloudSignedIn: Boolean(auth.currentUser),
    peer,
    freenet,
    cloudMirror: isCloudMirror(),
  };
}

/** This shell can start its own bundled / in-APK node. */
export function canStartOwnFreenetHost(): boolean {
  return Boolean(getDesktopBridge()?.freenet) || isFreenetHostPluginAvailable();
}

function countsLine(counts: { diary: number; blocks: number; issues: number }): string {
  return `${counts.diary} diary · ${counts.blocks} blocks · ${counts.issues} issues`;
}

export async function executeFarmSyncRoute(input: {
  farmId: string;
  farmName?: string;
  route: SyncRoute;
  manual: boolean;
}): Promise<string> {
  const { farmId, farmName, route, manual } = input;

  if (route === 'lan-sealed') {
    const result = await syncSealedFarmOverLan(farmId, { farmName });
    if (result.pulled) {
      await refreshFarmUiAfterRecovery(farmId);
      return countsLine({
        diary: result.pulled.applied.diary,
        blocks: result.pulled.applied.blocks,
        issues: result.pulled.applied.issues,
      });
    }
    if (result.alreadyCurrent) return 'already up to date';
    return `sent ${Math.round((result.pushed?.bytes ?? 0) / 1024)} KB to the shed`;
  }

  if (route === 'lan-pufom') {
    const pulled = await pullLanBundle(farmId);
    await pushLanBundle(farmId, farmName);
    if (pulled) {
      await refreshFarmUiAfterRecovery(farmId);
      return countsLine({
        diary: pulled.diary,
        blocks: pulled.blocks,
        issues: pulled.issues,
      });
    }
    return 'shelf was empty — this device filled it';
  }

  if (route === 'freenet-publish') {
    const status = getMistHotPublishStatus(farmId);
    const preset = findJoinPreset(status?.joinTicketPreset);
    if (!status?.freenetUri && !preset) {
      throw new Error(
        'This farm has not been sent over Freenet from this device yet — use “Send or ' +
          'join a farm over Freenet” below to choose what the join ticket grants.',
      );
    }
    const result = await publishFarmToFreenet(farmId, preset ? { preset } : {});
    return result.shortTicket
      ? `sent — join ticket ${result.shortTicket}`
      : 'sent, but no short join ticket could be published';
  }

  if (route === 'freenet-pull') {
    if (!manual) {
      const watch = await pollFreenetHotWatch(farmId);
      if (watch === 'applied') {
        await refreshFarmUiAfterHotMerge(farmId);
        return 'Freenet update applied';
      }
      return 'already up to date';
    }
    const status = getMistHotPublishStatus(farmId);
    if (!status?.freenetUri || !status.bonesFreenetUri) {
      throw new Error(
        'This device has no Freenet address for the farm yet. Join with a ticket once ' +
          'under “Send or join a farm over Freenet” below, and pulling works from then on.',
      );
    }
    await pullHotFromFreenetByUri(farmId, status.freenetUri, status.contentHash);
    await pullBonesFromFreenetByUri(
      farmId,
      status.bonesFreenetUri,
      status.bonesContentHash,
    );
    const merged = await applyPulledFreenetMirror(farmId);
    await refreshFarmUiAfterHotMerge(farmId);
    return countsLine({
      diary: merged.diary,
      blocks: merged.blocks,
      issues: merged.issues,
    });
  }

  return '';
}

export type FarmSyncNowResult = {
  ok: boolean;
  plan: SyncPlan;
  summary: string;
  peer: SyncPeerState;
  freenet: FreenetNodeState;
};

/**
 * Bring the in-app node up on a Freenet farm, probe, run the ladder.
 *
 * Never uploads map geometry to Firestore. That queue is cloud-only
 * (`farmGeometrySync` / `usesCloudSyncOutbox`).
 */
export async function syncFarmNow(
  farmId: string,
  opts?: { farmName?: string; manual?: boolean },
): Promise<FarmSyncNowResult> {
  const manual = opts?.manual ?? true;
  if (activeFarmPipe() !== 'cloud') {
    await ensureFreenetHostListening().catch(() => undefined);
  }

  const peer = await probeSyncPeer();
  const freenet = await probeFreenet();
  const plan = planFarmSync(readSyncConditions(peer, freenet));

  const stamp = (entry: Omit<LastSyncEntry, 'at'>): LastSyncEntry => ({
    at: new Date().toISOString(),
    ...entry,
  });

  if (plan.route === 'blocked') {
    if (manual) {
      writeLastSync(farmId, stamp({ via: plan.via, ok: false, summary: plan.label }));
    }
    return { ok: false, plan, summary: plan.label, peer, freenet };
  }

  try {
    const summary = await executeFarmSyncRoute({
      farmId,
      farmName: opts?.farmName,
      route: plan.route,
      manual,
    });
    writeLastSync(farmId, stamp({ via: plan.via, ok: true, summary }));
    return { ok: true, plan, summary, peer, freenet };
  } catch (error) {
    const summary = error instanceof Error ? error.message : String(error);
    if (manual) {
      writeLastSync(farmId, stamp({ via: plan.via, ok: false, summary }));
    }
    return { ok: false, plan, summary, peer, freenet };
  }
}
