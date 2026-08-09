/**
 * Where the Freenet node this device talks to actually lives.
 *
 * The mist UI ships in three shells. The Electron desktop owns a bundled
 * `freenet` child process; a browser talks to an Express that has one. A
 * Capacitor APK can host neither — Freenet 0.2 is a native Rust binary Android
 * will not let PUF-AM spawn, and there is no WASM peer to link in — so for a
 * long time the only honest tablet answers were "a hub holds the node" and "not
 * on this device".
 *
 * There is now a third. A **separate**, sideloaded Freenet Android app can hold
 * a real node and bind the ordinary 0.2 WS API on this device's loopback, and
 * the page can read from it directly. That is `android-local-node`, and it is a
 * reader: GET works, publishing still needs `fdev` on a laptop.
 *
 * Plan: `Plans/APK_FREENET_PLUGIN.md` §3a, §7.
 */

import { Capacitor } from '@capacitor/core';

import {
  localFreenetNodeEligible,
  localFreenetNodeFound,
  probeLocalFreenetNode,
} from '../mist/freenetLocalNode.ts';
import { apiHubMissing, getMistFreenetApiBaseUrl } from './apiBase.ts';
import { isDesktopShell } from './desktopBridge.ts';

export type FreenetRuntime =
  /** Electron shell — the app owns a bundled node (`units/puf-freenet-host`). */
  | 'desktop-host'
  /** Browser — same-origin Express, or the workshop `127.0.0.1:3000` sidecar. */
  | 'browser-sidecar'
  /**
   * Capacitor APK beside a Freenet node app on the same device, reachable on
   * `127.0.0.1:7509`. Reads come off that node; publishing does not.
   */
  | 'android-local-node'
  /**
   * Capacitor APK pointed at a named hub (`VITE_MIST_FREENET_API`). The node is
   * on that other machine; this device is only an HTTP client of it.
   */
  | 'android-hub'
  /** Capacitor APK with no hub — nothing here can host or reach a node. */
  | 'android-no-host';

export function freenetRuntimeFor(input: {
  desktop: boolean;
  native: boolean;
  /** A Freenet API base was baked into this build or chosen at runtime. */
  hubConfigured: boolean;
  /** A Freenet node answered on this device's own loopback WS API. */
  localNode?: boolean;
}): FreenetRuntime {
  if (input.desktop) return 'desktop-host';
  if (!input.native) return 'browser-sidecar';
  // A node on this device beats one across the shed for reads: no pairing, no
  // Wi‑Fi, and nothing to leave running on someone else's laptop.
  if (input.localNode) return 'android-local-node';
  return input.hubConfigured ? 'android-hub' : 'android-no-host';
}

/** True when a Connect button has something on the other end. */
export function canReachFreenetNode(runtime: FreenetRuntime): boolean {
  return runtime !== 'android-no-host';
}

/** Reads come off a node on this very device rather than out to a hub. */
export function freenetReadsLocally(runtime: FreenetRuntime): boolean {
  return runtime === 'android-local-node';
}

/**
 * True when this device can fetch a farm over Freenet but has no way to send one.
 *
 * The asymmetry is upstream's, not ours: 0.2's flatbuffers GET works from any
 * client, while a PUT still goes through the `fdev` CLI — a second native binary
 * that is not on the tablet and could not be exec'd there if it were. A paired
 * hub lifts it, because that laptop still has `fdev`.
 */
export function freenetIsReadOnlyHere(runtime: FreenetRuntime, hubAvailable: boolean): boolean {
  return freenetReadsLocally(runtime) && !hubAvailable;
}

/** `freenetIsReadOnlyHere` against the hub this device actually has. */
export function detectFreenetReadOnly(runtime: FreenetRuntime): boolean {
  return freenetIsReadOnlyHere(runtime, !apiHubMissing());
}

/**
 * Whether a join should ask a hub how its peer is doing.
 *
 * `settled` is the load-bearing half. Until `refreshFreenetRuntime()` has
 * answered, the only thing this device knows is whether it remembers a hub, and
 * a tablet that turns out to have its own node would already have spent a
 * request asking a laptop it does not need — at the address most likely to be
 * stale, since `pufom_last_sync_hub` outlives the shed it was saved in.
 *
 * Waiting costs a loopback probe, which either answers or times out in 2.5s.
 */
export function shouldPollHubPeerStatus(input: {
  runtime: FreenetRuntime;
  settled: boolean;
}): boolean {
  if (!input.settled) return false;
  return canReachFreenetNode(input.runtime) && !freenetReadsLocally(input.runtime);
}

function nativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    /* Capacitor is absent in tests and plain web builds. */
    return false;
  }
}

export function detectFreenetRuntime(): FreenetRuntime {
  const native = nativePlatform();

  // A hub baked in at build time was the only way to reach a node from Android,
  // which meant re-building the APK for every shed the tablet visits. A hub
  // chosen at runtime — NSD, or an address typed into Offline & sync — is the
  // same arrangement and reaches the same routes, so it counts the same.
  const hubConfigured =
    Boolean(String(import.meta.env.VITE_MIST_FREENET_API || '').trim()) ||
    (native && Boolean(getMistFreenetApiBaseUrl()));

  return freenetRuntimeFor({
    desktop: isDesktopShell(),
    native,
    hubConfigured,
    localNode: localFreenetNodeFound(),
  });
}

/**
 * The same answer, after actually looking for a node on this device.
 *
 * `detectFreenetRuntime()` has to be safe to call while rendering, so it can only
 * report what is already known. Surfaces that care call this once on mount and
 * re-read; on anything but a Capacitor build it settles immediately.
 */
export async function refreshFreenetRuntime(): Promise<FreenetRuntime> {
  if (localFreenetNodeEligible()) {
    await probeLocalFreenetNode().catch(() => false);
  }
  return detectFreenetRuntime();
}

/** One sentence for the readiness line, in the operator's words. */
export const FREENET_NO_HOST_LABEL =
  'Freenet does not run on this tablet — the farm is held here, but sending and joining need a PUF-AM laptop.';

/** The follow-up an operator needs once they have read the label. */
export const FREENET_NO_HOST_DETAIL =
  'Freenet 0.2 is a native binary PUF-AM cannot start on Android, so this build has no node of its own. Hold the farm here and work on it as usual. To send or join, borrow the node on a PUF-AM laptop: put both on the same Wi‑Fi, start PUF-AM there, then use Settings → Sync → Wi‑Fi (LAN) → Scan for hubs on this tablet (or type the laptop address). Once a hub answers, sending and joining work from here. If a separate Freenet node app is installed on this tablet, open it and wait for it to connect — joining then works here with no laptop at all. See Plans/APK_FREENET_PLUGIN.md.';
