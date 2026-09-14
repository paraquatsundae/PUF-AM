/**
 * Join waits for On Opennet (N≥1) before unwrap — no red “connect to Freenet”
 * as the first state. Same Opennet bar as Send; wait is 120 s.
 * Plans/FREENET_OPERATOR_FLOW.md Decision — 2026-09-14 (Join waits for On Opennet).
 */

import type { FreenetHostStatus, FreenetLeftoverKind } from '../../units/puf-freenet-host/src/types.ts';
import { androidFreenetHostStatusNow, isFreenetHostPluginAvailable } from './androidFreenetHost.ts';
import { getDesktopBridge } from './desktopBridge.ts';
import { isFreenetHostHoldOff } from './freenetHostHoldOff.ts';
import { FREENET_LOG_JOINING_COPY, FREENET_OPERATOR_STATUS_LABEL } from './freenetRingStatus.ts';
import { ensureFreenetHostListening } from '../mist/ensureFreenetHostListening.ts';

/** Same 120 s window as a native PUT once peered (Send). First Opennet hop can take minutes. */
export const FREENET_JOIN_WAIT_OPENNET_MS = 120_000;

/** Faster than Settings’ 8 s poll — Join should notice N≥1 without a long stall. */
export const FREENET_JOIN_WAIT_POLL_MS = 2_000;

export const FREENET_JOIN_CONNECTING_LABEL =
  'Connecting to peers — Listening until this node is On Opennet.';

export const FREENET_JOIN_CONNECTING_DETAIL =
  'The node is coming up. Opennet can take a few minutes.';

export const FREENET_JOIN_LISTENING_LABEL = `Listening. ${FREENET_LOG_JOINING_COPY}`;

export const FREENET_JOIN_OPENNET_LABEL = `${FREENET_OPERATOR_STATUS_LABEL.opennet} — joining the farm.`;

export const FREENET_JOIN_TIMEOUT_LABEL = 'Still Listening — no Opennet peers yet.';

export const FREENET_JOIN_TIMEOUT_DETAIL =
  'Waited two minutes. First Opennet hop can take a few minutes — tap Join again. If Freenet was stopped on this device, use Settings → Sync → Start Freenet. A leftover node: try Stop Freenet on this device, then Start. Freenet Android Node cannot be force-stopped from here.';

export const FREENET_JOIN_HOLD_OFF_LABEL = 'Freenet is stopped on this device.';

export const FREENET_JOIN_HOLD_OFF_DETAIL =
  'Settings → Sync → Stop Freenet is holding the node off. Tap Start Freenet there, then Join. This will not keep spinning.';

export const FREENET_JOIN_OFFLINE_LABEL = 'This device is offline.';

export const FREENET_JOIN_OFFLINE_DETAIL =
  'Join over Freenet needs a network so this node can find peers (On Opennet).';

export const FREENET_JOIN_FAILED_DETAIL =
  'Try Settings → Sync → Stop Freenet on this device, then Start Freenet.';

export const FREENET_JOIN_LEFTOVER_TIMEOUT_DETAIL =
  'Still Listening after two minutes. A leftover Freenet is attached (not a LAN hub). Try Settings → Sync → Stop Freenet on this device, then Start Freenet.';

export const FREENET_JOIN_ANDROID_NODE_TIMEOUT_DETAIL =
  'Still Listening after two minutes. Freenet Android Node is still on this device — PUF-AM cannot force-stop it. Open that app, or try Settings → Sync → Stop Freenet on this device then Start Freenet.';

export type FreenetJoinWaitPhase =
  | 'connecting'
  | 'ready'
  | 'timeout'
  | 'hold-off'
  | 'offline'
  | 'failed';

export type FreenetJoinWaitTone = 'wait' | 'ok' | 'error';

export type FreenetJoinWaitView = {
  phase: FreenetJoinWaitPhase;
  tone: FreenetJoinWaitTone;
  label: string;
  detail: string;
  peerCount: number;
  leftover: FreenetLeftoverKind | null;
};

export type FreenetJoinWaitSnapshot = {
  elapsedMs: number;
  /** 0 = never time out (status poll on the join screen). */
  timeoutMs?: number;
  holdOff: boolean;
  offline: boolean;
  host: FreenetHostStatus | null;
  /** False until the first status read — never an error tone for a starting node. */
  polled: boolean;
};

export type FreenetJoinWaitResult =
  | { ok: true; host: FreenetHostStatus | null; wait: FreenetJoinWaitView }
  | { ok: false; wait: FreenetJoinWaitView };

export type FreenetJoinWaitDeps = {
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  readHost?: () => Promise<FreenetHostStatus | null>;
  ensureHost?: () => Promise<void>;
  isHoldOff?: () => boolean;
  isOffline?: () => boolean;
  signal?: AbortSignal;
  onProgress?: (view: FreenetJoinWaitView) => void;
  /** Last status from the on-screen poll — skip the empty connecting flash when already ready. */
  seed?: FreenetJoinWaitView | null;
};

function peerCountOf(host: FreenetHostStatus | null): number {
  const n = host?.nodeRing?.peerCount;
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function leftoverOf(host: FreenetHostStatus | null): FreenetLeftoverKind | null {
  return host?.leftover && host.leftover !== 'none' ? host.leftover : null;
}

function timeoutDetail(host: FreenetHostStatus | null): string {
  const leftover = leftoverOf(host);
  if (leftover === 'android-node') return FREENET_JOIN_ANDROID_NODE_TIMEOUT_DETAIL;
  if (leftover || host?.mode === 'attached') return FREENET_JOIN_LEFTOVER_TIMEOUT_DETAIL;
  return FREENET_JOIN_TIMEOUT_DETAIL;
}

export function freenetJoinDeviceIsOffline(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}

export async function readFreenetJoinHostStatus(): Promise<FreenetHostStatus | null> {
  const bridge = getDesktopBridge();
  if (bridge?.freenet?.status) {
    try {
      return await bridge.freenet.status();
    } catch {
      return null;
    }
  }
  if (isFreenetHostPluginAvailable()) {
    try {
      return await androidFreenetHostStatusNow({ probe: true });
    } catch {
      return null;
    }
  }
  return null;
}

export function describeFreenetJoinWait(input: FreenetJoinWaitSnapshot): FreenetJoinWaitView {
  const timeoutMs = input.timeoutMs ?? FREENET_JOIN_WAIT_OPENNET_MS;
  const leftover = leftoverOf(input.host);
  const n = peerCountOf(input.host);

  if (input.holdOff) {
    return {
      phase: 'hold-off',
      tone: 'error',
      label: FREENET_JOIN_HOLD_OFF_LABEL,
      detail: FREENET_JOIN_HOLD_OFF_DETAIL,
      peerCount: n,
      leftover,
    };
  }
  if (input.offline) {
    return {
      phase: 'offline',
      tone: 'error',
      label: FREENET_JOIN_OFFLINE_LABEL,
      detail: FREENET_JOIN_OFFLINE_DETAIL,
      peerCount: n,
      leftover,
    };
  }
  if (!input.polled) {
    return {
      phase: 'connecting',
      tone: 'wait',
      label: FREENET_JOIN_CONNECTING_LABEL,
      detail: FREENET_JOIN_CONNECTING_DETAIL,
      peerCount: 0,
      leftover: null,
    };
  }
  if (input.host?.mode === 'failed') {
    return {
      phase: 'failed',
      tone: 'error',
      label: input.host.lastError?.trim() || 'The Freenet node on this device did not start.',
      detail: FREENET_JOIN_FAILED_DETAIL,
      peerCount: n,
      leftover,
    };
  }
  if (input.host?.reachable && n >= 1) {
    return {
      phase: 'ready',
      tone: 'ok',
      label: FREENET_JOIN_OPENNET_LABEL,
      detail: n === 1 ? 'This node is on Opennet (1 peer).' : `This node is on Opennet (${n} peers).`,
      peerCount: n,
      leftover,
    };
  }
  if (timeoutMs > 0 && input.elapsedMs >= timeoutMs) {
    return {
      phase: 'timeout',
      tone: 'error',
      label: FREENET_JOIN_TIMEOUT_LABEL,
      detail: timeoutDetail(input.host),
      peerCount: n,
      leftover,
    };
  }
  const listening = Boolean(input.host?.reachable || input.host?.mode === 'managed' || input.host?.mode === 'attached');
  return {
    phase: 'connecting',
    tone: 'wait',
    label: listening ? FREENET_JOIN_LISTENING_LABEL : FREENET_JOIN_CONNECTING_LABEL,
    detail: listening ? FREENET_LOG_JOINING_COPY : FREENET_JOIN_CONNECTING_DETAIL,
    peerCount: n,
    leftover,
  };
}

export function initialFreenetJoinWaitView(): FreenetJoinWaitView {
  return describeFreenetJoinWait({
    elapsedMs: 0,
    timeoutMs: 0,
    holdOff: false,
    offline: false,
    host: null,
    polled: false,
  });
}

export async function waitForFreenetJoinOpennet(
  deps: FreenetJoinWaitDeps = {},
): Promise<FreenetJoinWaitResult> {
  const timeoutMs = deps.timeoutMs ?? FREENET_JOIN_WAIT_OPENNET_MS;
  const pollMs = deps.pollMs ?? FREENET_JOIN_WAIT_POLL_MS;
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const readHost = deps.readHost ?? readFreenetJoinHostStatus;
  const ensureHost = deps.ensureHost ?? (() => ensureFreenetHostListening());
  const isHoldOff = deps.isHoldOff ?? isFreenetHostHoldOff;
  const isOffline = deps.isOffline ?? freenetJoinDeviceIsOffline;
  const startedAt = now();

  const emit = (snapshot: Omit<FreenetJoinWaitSnapshot, 'timeoutMs'>): FreenetJoinWaitView => {
    const view = describeFreenetJoinWait({ ...snapshot, timeoutMs });
    deps.onProgress?.(view);
    return view;
  };

  let view: FreenetJoinWaitView;
  if (deps.seed?.phase === 'ready') {
    view = deps.seed;
    deps.onProgress?.(view);
  } else {
    view = emit({
      elapsedMs: 0,
      holdOff: isHoldOff(),
      offline: isOffline(),
      host: null,
      polled: false,
    });
    if (view.phase === 'hold-off' || view.phase === 'offline') {
      return { ok: false, wait: view };
    }
  }

  for (;;) {
    if (deps.signal?.aborted) return { ok: false, wait: view };
    if (isHoldOff()) {
      view = emit({
        elapsedMs: now() - startedAt,
        holdOff: true,
        offline: false,
        host: null,
        polled: true,
      });
      return { ok: false, wait: view };
    }
    if (isOffline()) {
      view = emit({
        elapsedMs: now() - startedAt,
        holdOff: false,
        offline: true,
        host: null,
        polled: true,
      });
      return { ok: false, wait: view };
    }

    await ensureHost();
    const host = await readHost();
    view = emit({
      elapsedMs: now() - startedAt,
      holdOff: false,
      offline: false,
      host,
      polled: true,
    });
    if (view.phase === 'ready') return { ok: true, host, wait: view };
    if (view.phase === 'timeout' || view.phase === 'failed') return { ok: false, wait: view };

    await sleep(pollMs);
  }
}
