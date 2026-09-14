/**
 * Android `FreenetHostPlugin` adapter — lifecycle via Capacitor, bytes via the
 * page's own WS clients on `ws://127.0.0.1:7509`.
 *
 * Attach-if-port-taken is the product path this slice: Freenet Android Node
 * (or any node) already listening wins, and our `:freenet` process is not
 * required. PUT/slot use `BrowserFreenetPutClient` / `BrowserFreenetSlotClient`
 * (Plans/FREENET_NETWORK_PACK.md Phase 2). Ciphertext only.
 *
 * Same shape as the Electron preload bridge so `createHostTransport` can reuse it.
 */

import { assertCiphertextForFreenet } from '../../units/mist-freenet/src/ciphertext-guard.ts';
import { BrowserFreenetPutClient } from '../../units/mist-freenet/src/freenet02-native-put.ts';
import { BrowserFreenetSlotClient } from '../../units/mist-freenet/src/freenet02-native-slot.ts';
import { encodeFreenet02Uri } from '../../units/mist-freenet/src/freenet02-uri.ts';
import type {
  FreenetHostStatus,
  FreenetPutCiphertextResult,
  FreenetSlotPutInput,
  FreenetSlotPutResult,
} from '../../units/puf-freenet-host/src/types.ts';
import { shouldOfferStopFreenet } from '../../units/puf-freenet-host/src/quit-ask.ts';
import {
  androidAttachedStatus,
  androidFreenetHostStart,
  androidFreenetHostStatus,
  androidFreenetHostStatusNow,
  androidFreenetHostStop,
  androidMissingBinaryStatus,
  isFreenetHostPluginAvailable,
} from '../lib/androidFreenetHost.ts';
import type { DesktopFreenetDataBridge } from './freenetHostTransport.ts';
import { loadFreenetBrowserWasm } from './freenetBrowserWasm.ts';
import {
  localFreenetNodeFound,
  probeLocalFreenetNode,
  readLocalFreenetBlob,
} from './freenetLocalNode.ts';

export type AndroidFreenetHostDeps = {
  probe?: () => Promise<boolean>;
  nodeFound?: () => boolean;
  pluginStart?: () => Promise<FreenetHostStatus>;
  pluginStop?: () => Promise<FreenetHostStatus>;
  pluginStatus?: (options?: { probe?: boolean }) => Promise<FreenetHostStatus>;
  pluginAttach?: () => Promise<FreenetHostStatus>;
  pluginAvailable?: () => boolean;
  put?: (bytes: Uint8Array) => Promise<FreenetPutCiphertextResult>;
  get?: (uri: string) => Promise<Uint8Array | null>;
  slotPut?: (input: FreenetSlotPutInput) => Promise<FreenetSlotPutResult>;
  slotGet?: (instanceIdBase58: string) => Promise<Uint8Array | null>;
};

async function defaultPut(bytes: Uint8Array): Promise<FreenetPutCiphertextResult> {
  const wasm = await loadFreenetBrowserWasm('pack');
  const client = new BrowserFreenetPutClient();
  const result = await client.putPackBlob({ data: bytes, wasm });
  return { uri: result.uri };
}

async function defaultSlotPut(input: FreenetSlotPutInput): Promise<FreenetSlotPutResult> {
  const wasm = await loadFreenetBrowserWasm('slot');
  const client = new BrowserFreenetSlotClient();
  return client.putJoinSlot({ ...input, wasm });
}

async function defaultSlotGet(instanceIdBase58: string): Promise<Uint8Array | null> {
  return readLocalFreenetBlob(encodeFreenet02Uri(instanceIdBase58));
}

/**
 * Start the in-APK node when :7509 is down, then health-check. Attach only
 * after native `/v1/version` (plugin `start`). A Freenet farm must not wait
 * for a hub. Plans/FREENET_NETWORK_PACK.md Decision — 2026-09-14.
 */
export async function ensureAndroidFreenetListening(
  deps: AndroidFreenetHostDeps = {},
): Promise<boolean> {
  const after = await androidFreenetHostBringUp(deps);
  return (
    after.mode === 'attached' ||
    after.mode === 'managed' ||
    after.mode === 'starting' ||
    after.reachable === true
  );
}

/**
 * Plugin `start` identifies Freenet 0.2 (`GET /v1/version`) then attaches or
 * spawns. WS-only attach is only when the plugin is absent.
 */
export async function androidFreenetHostBringUp(deps: AndroidFreenetHostDeps = {}): Promise<FreenetHostStatus> {
  const probe = deps.probe ?? (() => probeLocalFreenetNode({ force: true }));
  const pluginAvailable = (deps.pluginAvailable ?? isFreenetHostPluginAvailable)();
  if (!pluginAvailable) {
    if (await probe()) return androidAttachedStatus();
    return androidMissingBinaryStatus();
  }

  const started = await (deps.pluginStart ?? androidFreenetHostStart)();
  if (started.leftover === 'ours' && started.reachable) {
    return { ...started, mode: 'managed', lastError: undefined };
  }
  if (started.mode === 'attached' || started.mode === 'managed') return started;
  // `starting`, or a stale fail-clean racing a new spawn — wait for :7509.
  // Do not flip a successful bind to foreign attach (that was the already-open copy).
  if (started.mode === 'starting' || started.mode === 'failed') {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (await probe()) {
        const now = await (deps.pluginStatus ?? androidFreenetHostStatusNow)({ probe: true });
        if (now.mode === 'attached' || now.mode === 'managed') return now;
        return { ...started, mode: 'managed', reachable: true, lastError: undefined };
      }
      const now = await (deps.pluginStatus ?? androidFreenetHostStatusNow)({ probe: true });
      if (now.mode === 'attached' || now.mode === 'managed') return now;
      if (now.mode === 'failed' && now.lastError && !/no android-arm64 binary/i.test(now.lastError)) {
        return now;
      }
    }
  }
  return started;
}

export async function androidFreenetHostReadStatus(
  deps: AndroidFreenetHostDeps = {},
): Promise<FreenetHostStatus> {
  const pluginAvailable = (deps.pluginAvailable ?? isFreenetHostPluginAvailable)();
  if (pluginAvailable) {
    const native = await (deps.pluginStatus ?? androidFreenetHostStatusNow)({ probe: true });
    if (native.leftover === 'ours' && native.reachable) {
      return { ...native, mode: 'managed', lastError: undefined };
    }
    if (native.mode === 'attached' || native.mode === 'managed' || native.reachable) return native;
    return native;
  }
  if ((deps.nodeFound ?? localFreenetNodeFound)()) return androidAttachedStatus();
  const probe = deps.probe ?? (() => probeLocalFreenetNode());
  if (await probe()) return androidAttachedStatus();
  return androidFreenetHostStatus();
}

/**
 * Never kill a node we did not start. Freenet Android Node stays up; we only
 * stop our `:freenet` service when the plugin says we manage it.
 */
export async function androidFreenetHostTakeDown(
  deps: AndroidFreenetHostDeps = {},
): Promise<FreenetHostStatus> {
  const pluginAvailable = (deps.pluginAvailable ?? isFreenetHostPluginAvailable)();
  if (pluginAvailable) {
    const now = await (deps.pluginStatus ?? androidFreenetHostStatusNow)({ probe: true });
    if (!shouldOfferStopFreenet(now.mode)) {
      if (now.mode === 'attached' || now.reachable || (deps.nodeFound ?? localFreenetNodeFound)()) {
        return now.mode === 'attached' ? now : androidAttachedStatus();
      }
      return now;
    }
    const after = await (deps.pluginStop ?? androidFreenetHostStop)();
    if (after.mode === 'attached') return after;
    if ((deps.nodeFound ?? localFreenetNodeFound)() || after.reachable) {
      return androidAttachedStatus();
    }
    return after;
  }
  if ((deps.nodeFound ?? localFreenetNodeFound)()) return androidAttachedStatus();
  return androidFreenetHostStatus();
}

export function createAndroidFreenetBridge(deps: AndroidFreenetHostDeps = {}): DesktopFreenetDataBridge {
  return {
    status: () => androidFreenetHostReadStatus(deps),
    start: () => androidFreenetHostBringUp(deps),
    stop: () => androidFreenetHostTakeDown(deps),
    onState: () => () => {},
    put: async (args) => {
      assertCiphertextForFreenet(args.key ?? 'puf-freenet-host', args.bytes);
      const put = deps.put ?? defaultPut;
      return put(args.bytes);
    },
    get: (uri) => (deps.get ?? readLocalFreenetBlob)(uri),
    slotPut: (input) => (deps.slotPut ?? defaultSlotPut)(input),
    slotGet: (id) => (deps.slotGet ?? defaultSlotGet)(id),
  };
}

let cached: DesktopFreenetDataBridge | null = null;

/** One adapter per page — same as the Electron preload object. */
export function getAndroidFreenetBridge(): DesktopFreenetDataBridge {
  if (!cached) cached = createAndroidFreenetBridge();
  return cached;
}

/** Tests: drop the singleton so the next call rebuilds. */
export function resetAndroidFreenetBridgeForTests(): void {
  cached = null;
}
