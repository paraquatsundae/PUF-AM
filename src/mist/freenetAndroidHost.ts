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
 * Attach first. A live :7509 is the host, even when our process has no binary.
 * Native start only runs when nothing is listening.
 */
export async function androidFreenetHostBringUp(deps: AndroidFreenetHostDeps = {}): Promise<FreenetHostStatus> {
  const probe = deps.probe ?? (() => probeLocalFreenetNode({ force: true }));
  if (await probe()) return androidAttachedStatus();

  const pluginAvailable = (deps.pluginAvailable ?? isFreenetHostPluginAvailable)();
  if (!pluginAvailable) return androidMissingBinaryStatus();

  const started = await (deps.pluginStart ?? androidFreenetHostStart)();
  if (started.mode === 'attached' || started.mode === 'managed') return started;
  if (await probe()) return androidAttachedStatus();
  return started;
}

export async function androidFreenetHostReadStatus(
  deps: AndroidFreenetHostDeps = {},
): Promise<FreenetHostStatus> {
  if ((deps.nodeFound ?? localFreenetNodeFound)()) return androidAttachedStatus();
  const probe = deps.probe ?? (() => probeLocalFreenetNode());
  if (await probe()) return androidAttachedStatus();

  const pluginAvailable = (deps.pluginAvailable ?? isFreenetHostPluginAvailable)();
  if (!pluginAvailable) return androidFreenetHostStatus();
  const native = await (deps.pluginStatus ?? androidFreenetHostStatusNow)({ probe: true });
  if (native.mode === 'attached' || native.mode === 'managed' || native.reachable) return native;
  return native;
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
    const after = await (deps.pluginStop ?? androidFreenetHostStop)();
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
