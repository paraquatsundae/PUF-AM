/**
 * The network pack's transport contract — every Freenet operation the pack
 * performs, behind one interface with two implementations.
 *
 * Plans/FREENET_NETWORK_PACK.md decision 2 (Phase 1 slice B): the pack talks
 * to `FreenetHostPlugin`, and Express `/api/mist/freenet/*` survives only as the
 * LAN relay for clients without a host.
 *
 * | Implementation | Who moves the bytes | Chosen when |
 * |----------------|---------------------|-------------|
 * | `freenetHostTransport.ts` | renderer → host adapter (Electron IPC, or Android attach + page WS) | capability `'electron'` or `'android'` and the bridge has the data members |
 * | `freenetRelayTransport.ts` | HTTP to `/api/mist/freenet/*` on a hub | anything else — workshop `npm run dev`, a tablet paired to a hub |
 *
 * The local-node-first read path on Capacitor (`freenetLocalNode.ts`) is layered
 * *above* this in `mistFreenetClient.ts` and `joinSlotFreenet.ts`, as before.
 *
 * Everything crossing this seam is ciphertext or a signed slot state. Sealing
 * happens in the page before a call; the transport never sees a key.
 */

import type { FreenetPeerStatus } from '../../units/mist-freenet/src/freenet-peer.ts';
import type { FreenetHostCapability } from '../lib/freenetHostCapability.ts';

export type FreenetTransportKind = 'host' | 'relay';

export type FreenetBlobKind = 'hot' | 'bones';

/** A sealed blob on its way to Freenet, with the mist key it lives under here. */
export type FreenetPublishInput = {
  farmId: string;
  kind: FreenetBlobKind;
  /** `mist/v1/farm/{farmId}/…` — the storage key on this device. */
  storageKey: string;
  ciphertext: Uint8Array;
  contentHash: string;
};

export type FreenetPublishOutcome = {
  storageKey: string;
  contentHash: string;
  /** `FN02@…` once the node has it. Absent only when the relay queued the put. */
  freenetUri?: string;
  /** Relay only: the hub's peer is offline and the put sits in its outbox. */
  freenetPending?: boolean;
  publishedAt: string;
};

export type FreenetHotRecord = {
  storageKey: string;
  freenetUri: string;
  contentHash: string;
  freenetPending?: boolean;
  insertedAt?: number;
};

export type FreenetFetchInput = {
  farmId: string;
  kind: FreenetBlobKind;
  storageKey: string;
  freenetUri: string;
  /** From the ticket or manifest; the host path verifies against it, the relay labels with it. */
  contentHash?: string;
};

export type FreenetFetchedBlob = {
  storageKey: string;
  ciphertext: Uint8Array;
  contentHash: string;
  freenetUri?: string;
};

export type FreenetSlotPublishInput = {
  /** slot id ‖ verifying key — fixes the address. */
  parameters: Uint8Array;
  /** Signed and sealed `PUFSLOT1` state, whole. */
  state: Uint8Array;
  instanceIdBase58: string;
};

export type FreenetSlotPublishOutcome = {
  uri: string;
  instanceIdBase58: string;
  mode: 'put' | 'update';
  publishedAt: string;
};

export type FreenetTransportFailure =
  /** Nothing answered: no hub, no host, or the node is down. Another route may still do better. */
  | 'unreachable'
  /** The far end answered and does not have it (yet). */
  | 'not-found'
  /** The far end answered with an error, or returned bytes that do not match what was asked for. */
  | 'rejected';

export class FreenetTransportError extends Error {
  constructor(
    readonly reason: FreenetTransportFailure,
    message: string,
  ) {
    super(message);
    this.name = 'FreenetTransportError';
  }
}

export interface FreenetPackTransport {
  readonly kind: FreenetTransportKind;

  /** The client connection this device uses to reach Freenet, as the cards read it. */
  peerStatus(): Promise<FreenetPeerStatus>;
  peerStart(options?: { contribute?: boolean }): Promise<FreenetPeerStatus>;
  peerStop(): Promise<FreenetPeerStatus>;
  peerSetContribute(enabled: boolean): Promise<FreenetPeerStatus>;

  /** Put sealed Hot or bones bytes; the caller remembers the URI. */
  publishBlob(input: FreenetPublishInput): Promise<FreenetPublishOutcome>;
  /** The `hot/current` URI this device last published, if it has one. */
  hotRecord(farmId: string): Promise<FreenetHotRecord | null>;
  /** `hot/current` by this device's own record. Throws `not-found` when there is none. */
  pullHot(farmId: string): Promise<FreenetFetchedBlob>;
  /** Any sealed blob by URI. Throws `not-found` when no peer has it yet. */
  pullByUri(input: FreenetFetchInput): Promise<FreenetFetchedBlob>;

  slotPublish(input: FreenetSlotPublishInput): Promise<FreenetSlotPublishOutcome>;
  /** Signed slot state, unverified — the caller checks the signature. Throws `not-found`. */
  slotRead(instanceIdBase58: string, options?: { signal?: AbortSignal }): Promise<Uint8Array>;
}

/**
 * Which implementation a shell gets. Pure, so the rule is testable: an Electron
 * shell whose preload predates the data channels still gets the relay, because
 * a host that cannot move bytes is not a host.
 */
export function selectFreenetTransportKind(input: {
  capability: FreenetHostCapability;
  bridgeHasDataPath: boolean;
}): FreenetTransportKind {
  return (input.capability === 'electron' || input.capability === 'android') &&
    input.bridgeHasDataPath
    ? 'host'
    : 'relay';
}
