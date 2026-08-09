/**
 * A Freenet node on *this* device's loopback, and whether there is one.
 *
 * Until now the page's only route to Freenet was an Express somewhere else —
 * same-origin on desktop, a shed laptop over the LAN on a tablet. A sideloaded
 * Freenet Android node changes that for reads: it binds the ordinary 0.2 WS API
 * on `127.0.0.1:7509`, Android loopback is device-wide, and PUF-AM's
 * `network_security_config.xml` already permits cleartext there. So a tablet can
 * resolve a join slot and pull a farm with no hub at all.
 *
 * Two deliberate limits:
 *
 * - **Reads only.** Publishing needs `fdev`, which is not on the tablet and could
 *   not be exec'd if it were, so the send path is untouched and still wants a hub.
 *
 * - **Not on desktop.** The Electron shell owns a bundled node and reaches it
 *   through its own Express; probing loopback there would find that same node by
 *   a second route for no gain. Only a Capacitor build prefers this path, unless
 *   `VITE_LOCAL_FREENET_WS` names an endpoint explicitly for a workshop bench.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §3a, §7a
 */

import { Capacitor } from '@capacitor/core';

import type {
  BrowserFreenetGetClient,
  BrowserFreenetGetOptions,
} from '../../units/mist-freenet/src/freenet02-browser-get.ts';
import { DEFAULT_LOCAL_FREENET_WS_URL } from '../../units/mist-freenet/src/freenet02-browser-get-url.ts';
import { isDesktopShell } from '../lib/desktopBridge.ts';

/** The endpoint this device would use, from the build flag or the 0.2 default. */
export function localFreenetWsUrl(): string {
  const configured = String(import.meta.env.VITE_LOCAL_FREENET_WS || '').trim();
  return configured || DEFAULT_LOCAL_FREENET_WS_URL;
}

/**
 * Whether it is worth looking for a node here at all.
 *
 * A build flag counts on any shell, so the workshop can point a desktop browser
 * at a bare `freenet network` without a Capacitor device in the room.
 */
export function localFreenetNodeEligible(): boolean {
  if (String(import.meta.env.VITE_LOCAL_FREENET_WS || '').trim()) return true;
  if (isDesktopShell()) return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

type ProbeState = {
  answered: boolean;
  at: number;
};

/**
 * A node that has answered stays answered for a while; one that has not is worth
 * asking about again soon, because "start the Freenet app, then come back" is the
 * whole recovery and it should not need an app restart.
 */
const FOUND_TTL_MS = 60_000;
const MISSING_TTL_MS = 10_000;

/** Loopback either answers immediately or is not there. */
const PROBE_TIMEOUT_MS = 2_500;

let state: ProbeState | null = null;
let inFlight: Promise<boolean> | null = null;

/** The last answer, without asking again — safe to call during a render. */
export function localFreenetNodeFound(): boolean {
  return state?.answered ?? false;
}

/** Forget everything learned about the local node (tests, and "look again" buttons). */
export function resetLocalFreenetNode(): void {
  state = null;
  inFlight = null;
  client = null;
  clientPromise = null;
}

function fresh(current: ProbeState): boolean {
  const ttl = current.answered ? FOUND_TTL_MS : MISSING_TTL_MS;
  return Date.now() - current.at < ttl;
}

/**
 * Is a Freenet node listening on this device?
 *
 * A bare WebSocket open, not a contract GET: the question is whether anything is
 * on the port, and loading the flatbuffers client to ask it would put ~200 KB of
 * SDK into the first paint of every tablet, most of which have no node.
 */
export async function probeLocalFreenetNode(options?: { force?: boolean }): Promise<boolean> {
  if (!localFreenetNodeEligible()) {
    state = { answered: false, at: Date.now() };
    return false;
  }
  if (!options?.force && state && fresh(state)) return state.answered;
  if (inFlight) return inFlight;

  inFlight = openProbe(localFreenetWsUrl())
    .then((answered) => {
      state = { answered, at: Date.now() };
      return answered;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function openProbe(wsUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof WebSocket === 'undefined') {
      resolve(false);
      return;
    }

    let socket: WebSocket;
    try {
      // The real client asks for the same encoding, so the node sees the probe as
      // an ordinary client rather than something to complain about in its log.
      socket = new WebSocket(`${wsUrl}?encodingProtocol=flatbuffers`);
    } catch {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (answered: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(answered);
    };

    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    socket.onopen = () => finish(true);
    socket.onerror = () => finish(false);
    socket.onclose = () => finish(false);
  });
}

type ClientFactory = (wsUrl: string) => Promise<BrowserFreenetGetClient>;

const defaultFactory: ClientFactory = async (wsUrl) => {
  // Loaded here rather than at the top of the module so the flatbuffers SDK is a
  // chunk only a device that actually has a node ever downloads.
  const { BrowserFreenetGetClient: Client } = await import(
    '../../units/mist-freenet/src/freenet02-browser-get.ts'
  );
  return new Client({ wsUrl });
};

let factory: ClientFactory = defaultFactory;
let client: BrowserFreenetGetClient | null = null;
let clientPromise: Promise<BrowserFreenetGetClient> | null = null;

/** Swap the transport for a fake. Tests only. */
export function setLocalFreenetClientFactory(next: ClientFactory | null): void {
  factory = next ?? defaultFactory;
  client = null;
  clientPromise = null;
}

async function getClient(): Promise<BrowserFreenetGetClient> {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = factory(localFreenetWsUrl())
      .then((created) => {
        client = created;
        return created;
      })
      .finally(() => {
        clientPromise = null;
      });
  }
  return clientPromise;
}

/**
 * Read `FN02@…` off the node on this device, or `null` when it has nothing there.
 *
 * Throws only when the node itself could not be used, which is the signal callers
 * need to fall back to a hub.
 */
export async function readLocalFreenetBlob(
  uri: string,
  options?: BrowserFreenetGetOptions,
): Promise<Uint8Array | null> {
  const active = await getClient();
  return active.getBlob(uri, options ?? {});
}

/** True when reads should go to this device's own node instead of a hub. */
export async function useLocalFreenetForReads(): Promise<boolean> {
  if (!localFreenetNodeEligible()) return false;
  return probeLocalFreenetNode();
}

/**
 * How long to let this device's node search before giving up on it.
 *
 * Freenet answers "found" or nothing; a blob no nearby peer has seen is a search
 * that runs until someone stops it. So the number is really a question about
 * what else there is to try. With a hub in reserve, one 30s pass matches what
 * that hub would spend on the same GET, and two nodes see different parts of the
 * network so handing over is worth more than searching twice here. With no hub,
 * this *is* the route and there is nothing to hurry towards.
 */
export function localFreenetSearchBudgetMs(hasFallback: boolean): number {
  return hasFallback ? 30_000 : 150_000;
}

/** What the operator is told when the tablet is reading from its own node. */
export const FREENET_LOCAL_NODE_LABEL =
  'Reading Freenet from the node on this tablet — no laptop needed to join.';

/** And what that node still cannot do. */
export const FREENET_LOCAL_NODE_DETAIL =
  'The Freenet Android node app on this tablet answers lookups, so a join ticket resolves and ' +
  'the farm downloads here directly. Sending a farm from this tablet still needs a PUF-AM ' +
  'laptop — publishing uses a tool that does not run on Android.';

/** And when the node app is installed but not running. */
export const FREENET_LOCAL_NODE_MISSING_DETAIL =
  'If you have the Freenet node app on this tablet, open it and wait for it to say it is ' +
  'connected, then try again.';
