/**
 * Join-slot byte moving, shared by the two callers that do it.
 *
 * `mistFreenetRoutes.ts` (`slot/publish`, `slot/:instanceId`) does it for a
 * paired tablet through the LAN relay; `freenetHostWire.ts` does it for the
 * renderer through `FreenetHostPlugin.putSlotState / getSlotState` on Electron
 * (Plans/FREENET_NETWORK_PACK.md decision 2, Phase 1 slice B). One module so
 * the two cannot drift on what a slot id looks like, what counts as the
 * caller's fault, or how a publish reaches the node.
 *
 * Nothing here can read a slot. The address, the signature and the AEAD seal are
 * all produced in the page from the FarmSeed; this publishes and fetches bytes it
 * could not forge (Plans/reference/MIST_TWO_FEDORA_FREENET.md § Freenet slot
 * contract). Since Phase 2 (decision 1) the publish is the app's own native
 * client — `putJoinSlotNative` → `BrowserFreenetSlotClient`: PUT, and on an
 * "already exists" answer `UpdateData::State` with the real code hash. No CLI.
 */

import {
  putJoinSlotNative,
  type PutJoinSlotOptions,
  type SlotPutResult,
} from '../units/mist-freenet/src/freenet02-slot-publish.ts';
import { encodeFreenet02Uri } from '../units/mist-freenet/src/freenet02-uri.ts';
import type { FreenetTransport } from '../units/mist-freenet/src/freenet-transport.ts';

/** Base58 contract instance id, the length range Freenet 0.2 produces. */
export const JOIN_SLOT_INSTANCE_ID_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

export function isJoinSlotInstanceId(value: unknown): value is string {
  return typeof value === 'string' && JOIN_SLOT_INSTANCE_ID_RE.test(value);
}

export type JoinSlotPublishInput = {
  parameters: Uint8Array;
  state: Uint8Array;
  instanceIdBase58: string;
};

export type JoinSlotPublishResult = SlotPutResult;

export type JoinSlotPutFn = (input: JoinSlotPublishInput) => Promise<JoinSlotPublishResult>;

/**
 * The native slot publish bound to one node. The host wire passes the node it
 * supervises; the relay passes nothing and lets `FREENET_WS_URL` decide.
 */
export function nativeJoinSlotPut(options: PutJoinSlotOptions = {}): JoinSlotPutFn {
  return (input) => putJoinSlotNative(input, options);
}

/**
 * Publish or refresh a slot. Structural checks (parameters length, `PUFSLOT1`
 * magic) happen inside the put, before anything leaves the machine. `put` is
 * injectable so the wire can be tested without a node.
 */
export async function publishJoinSlot(
  input: JoinSlotPublishInput,
  put: JoinSlotPutFn = nativeJoinSlotPut(),
): Promise<JoinSlotPublishResult> {
  if (!isJoinSlotInstanceId(input.instanceIdBase58)) {
    throw new Error('slot put: instanceIdBase58 must be a base58 contract instance id');
  }
  return put(input);
}

/**
 * Current state of a slot, straight off the wire.
 *
 * The mist store indexes `mist/v1/…` keys; a slot has none, so this goes to the
 * transport directly and nothing is cached under a made-up key. `null` when no
 * peer has the slot yet — ordinary for the first minutes after a publish.
 */
export async function readJoinSlotState(
  transport: Pick<FreenetTransport, 'getBlob'>,
  instanceIdBase58: string,
): Promise<Uint8Array | null> {
  if (!isJoinSlotInstanceId(instanceIdBase58)) {
    throw new Error('slot get: instanceId must be a base58 contract instance id');
  }
  const state = await transport.getBlob(encodeFreenet02Uri(instanceIdBase58));
  return state?.length ? state : null;
}

/** A malformed slot state or id is the caller's bug, not the node's. */
export function isJoinSlotCallerError(message: string): boolean {
  return /must be|PUFSLOT1|refusing to publish/.test(message);
}
