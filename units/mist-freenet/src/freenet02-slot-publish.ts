/**
 * Join-slot publish from a Node runtime — loads the vendored WASM, then hands
 * the bytes to `BrowserFreenetSlotClient`.
 *
 * The client is the whole publish path (Plans/FREENET_NETWORK_PACK.md decision
 * 1, Phase 2); this file only adds what a WebView never needs — reading
 * `slot-contract.wasm` off disk and the node's coordinates out of the
 * environment. `server/freenetSlotOps.ts` calls it for both the Electron host
 * wire and the LAN relay, so one function decides how a slot reaches the node.
 *
 * Nothing here holds a farm secret. The caller hands over `parameters` and a
 * state that was signed and sealed in the page, so this is a byte mover — which
 * is what keeps encrypt-before-upload true for the slot as well as the blobs.
 *
 * @see units/mist-freenet/contracts/slot-contract — the contract these bytes are for
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_LOCAL_FREENET_WS_URL } from './freenet02-browser-get-url.ts';
import {
  BrowserFreenetSlotClient,
  type BrowserFreenetSlotClientOptions,
  type NativeSlotPutResult,
} from './freenet02-native-slot.ts';

/** Workshop default — the vendored, pinned slot WASM. */
export const DEFAULT_SLOT_CONTRACT_WASM = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/slot-contract.wasm',
);

export function resolveSlotContractWasmPath(): string {
  const fromEnv = process.env.FREENET_SLOT_WASM?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return DEFAULT_SLOT_CONTRACT_WASM;
}

let cachedWasm: Uint8Array | null = null;
let cachedWasmPath: string | null = null;

export async function loadSlotContractWasm(): Promise<Uint8Array> {
  const wasmPath = resolveSlotContractWasmPath();
  if (cachedWasm && cachedWasmPath === wasmPath) return cachedWasm;
  const buf = await readFile(wasmPath);
  cachedWasm = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  cachedWasmPath = wasmPath;
  return cachedWasm;
}

/** Reset the cached WASM (tests). */
export function resetSlotContractWasmCache(): void {
  cachedWasm = null;
  cachedWasmPath = null;
}

export type SlotPutResult = NativeSlotPutResult;

export type PutJoinSlotOptions = BrowserFreenetSlotClientOptions & {
  /** Tests: stand in for the disk read. */
  wasm?: Uint8Array;
};

/**
 * Publish or refresh a join slot on the node at `FREENET_WS_URL` (or the
 * option). Structural checks (parameters length, `PUFSLOT1` magic) and the
 * PUT-then-UPDATE upsert live in the client; this resolves what it needs.
 */
export async function putJoinSlotNative(
  input: {
    parameters: Uint8Array;
    state: Uint8Array;
    /** Base58 instance id the caller derived — checked against the WASM's code hash. */
    instanceIdBase58: string;
  },
  options: PutJoinSlotOptions = {},
): Promise<SlotPutResult> {
  const { wasm: injectedWasm, ...clientOptions } = options;
  const wasm = injectedWasm ?? (await loadSlotContractWasm());
  const client = new BrowserFreenetSlotClient({
    ...clientOptions,
    wsUrl: clientOptions.wsUrl ?? process.env.FREENET_WS_URL ?? DEFAULT_LOCAL_FREENET_WS_URL,
    authToken: clientOptions.authToken ?? process.env.FREENET_WS_AUTH ?? '',
  });
  return client.putJoinSlot({ ...input, wasm });
}
