/**
 * Host transport — the renderer talks to `FreenetHostPlugin` over the preload
 * bridge (`puf-freenet:*` IPC), and to nothing else.
 *
 * Plans/FREENET_NETWORK_PACK.md decision 2: on Electron the pack's data path is
 * the host, not the loopback Express. The host moves bytes; everything the relay
 * used to keep on the hub's disk — which URI `hot/current` was last published
 * under, whether a put is pending — this device already keeps in the page
 * (`mistHotPublishMeta.ts`, IndexedDB via the Hot bridge), so nothing new is
 * stored to make that true.
 *
 * Two deliberate differences from the relay:
 *
 * - **No outbox.** A put while the node is down fails here, where the relay
 *   queued it and returned a placeholder URI with `freenetPending: true`. A
 *   ticket built from a placeholder never resolved anyway; failing is honest.
 * - **The hash is checked in the page.** The relay labels whatever it fetched
 *   with the hash it was told; here the manifest the owner signed is in hand, so
 *   bytes that do not match it are refused as substituted rather than passed on
 *   to fail at the AEAD open with a message about the FarmCode.
 */

import type { FreenetPeerStatus } from '../../units/mist-freenet/src/freenet-peer.ts';
import { normalizeMistFreenetUri } from '../../units/mist-freenet/src/freenet-uri-normalize.ts';
import { sha256Hex } from '../../units/mist-freenet/src/hash.ts';
import { hotKey } from '../../units/mist-freenet/src/keys.ts';
import type { FreenetHostStatus } from '../../units/puf-freenet-host/src/types.ts';
import type { DesktopFreenetBridge } from '../lib/desktopBridge.ts';
import {
  FreenetTransportError,
  type FreenetFetchInput,
  type FreenetHotRecord,
  type FreenetPackTransport,
  type FreenetPublishInput,
  type FreenetSlotPublishInput,
} from './freenetPackTransport.ts';
import { getMistHotPublishStatus } from './mistHotPublishMeta.ts';

/** The four data members a preload built for slice B exposes. */
export type DesktopFreenetDataBridge = DesktopFreenetBridge &
  Required<Pick<DesktopFreenetBridge, 'put' | 'get' | 'slotPut' | 'slotGet'>>;

export function bridgeHasFreenetDataPath(
  bridge: DesktopFreenetBridge | null | undefined,
): bridge is DesktopFreenetDataBridge {
  return Boolean(
    bridge &&
      typeof bridge.put === 'function' &&
      typeof bridge.get === 'function' &&
      typeof bridge.slotPut === 'function' &&
      typeof bridge.slotGet === 'function',
  );
}

export const FREENET_HOST_BACKEND_ID = 'puf-freenet-host';

/**
 * The cards read a *peer* status — the client connection to a node — and on
 * the host path that connection is the host's own wire. So the peer is up when
 * the node is reachable, and `running` when the host manages or has attached a
 * node. Outbox and index counts belong to the relay's store and stay unset.
 */
export function peerStatusFromHost(status: FreenetHostStatus | null): FreenetPeerStatus {
  if (!status) {
    return {
      running: false,
      connected: false,
      contribute: false,
      backendId: FREENET_HOST_BACKEND_ID,
      transportId: 'ws02',
      transportLabel: 'Freenet 0.2 WebSocket',
      freenet: 'disconnected',
      rootDir: '',
      lastError: 'Freenet host not available in this shell',
    };
  }
  const running = status.mode === 'managed' || status.mode === 'attached';
  const freenet = status.reachable ? 'connected' : status.mode === 'starting' ? 'connecting' : 'disconnected';
  return {
    running,
    connected: status.reachable,
    contribute: false,
    backendId: FREENET_HOST_BACKEND_ID,
    transportId: 'ws02',
    transportLabel: 'Freenet 0.2 WebSocket',
    freenet,
    host: status.wsHost,
    port: status.wsPort,
    endpoint: status.wsUrl,
    ...(status.binary?.version ? { nodeVersion: status.binary.version } : {}),
    rootDir: status.dataDir,
    ...(status.lastError ? { lastError: status.lastError } : {}),
  };
}

/** Electron wraps a handler's rejection as `Error invoking remote method 'x': Error: msg`. */
export function ipcErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const stripped = raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '');
  return stripped || fallback;
}

function notFoundMessage(kind: FreenetFetchInput['kind']): string {
  return kind === 'hot'
    ? 'Hot not found on Freenet at URI (Opennet propagation may still be in progress)'
    : 'Bones not found on Freenet at URI (Opennet propagation may still be in progress)';
}

export function createHostTransport(bridge: DesktopFreenetDataBridge): FreenetPackTransport {
  async function hostStatus(): Promise<FreenetHostStatus | null> {
    try {
      return await bridge.status();
    } catch {
      return null;
    }
  }

  async function call<T>(what: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof FreenetTransportError) throw error;
      throw new FreenetTransportError('rejected', ipcErrorMessage(error, `${what} failed`));
    }
  }

  async function hotRecord(farmId: string): Promise<FreenetHotRecord | null> {
    const saved = getMistHotPublishStatus(farmId);
    if (!saved?.freenetUri) return null;
    return {
      storageKey: saved.storageKey || hotKey(farmId, 'current'),
      freenetUri: saved.freenetUri,
      contentHash: saved.contentHash,
      ...(saved.freenetPending !== undefined ? { freenetPending: saved.freenetPending } : {}),
    };
  }

  async function pullByUri(input: FreenetFetchInput) {
    const freenetUri = normalizeMistFreenetUri(input.freenetUri);
    const bytes = await call('fetch', () => bridge.get(freenetUri));
    if (!bytes?.length) {
      throw new FreenetTransportError('not-found', notFoundMessage(input.kind));
    }
    const actual = sha256Hex(bytes);
    if (input.contentHash && actual !== input.contentHash) {
      throw new FreenetTransportError(
        'rejected',
        `Freenet returned the wrong bytes for ${freenetUri} — the farm owner's ticket says ` +
          `${input.contentHash.slice(0, 12)}… and this computer's node fetched ${actual.slice(0, 12)}…`,
      );
    }
    return { storageKey: input.storageKey, ciphertext: bytes, contentHash: actual, freenetUri };
  }

  return {
    kind: 'host',

    async peerStatus() {
      return peerStatusFromHost(await hostStatus());
    },

    async peerStart() {
      // Node and peer are one thing here: the host's wire connects on the first
      // put or get, so a reachable node is a connected peer.
      const status = await call('start', () => bridge.start());
      if (!status) {
        throw new FreenetTransportError('unreachable', 'Freenet did not start on this computer.');
      }
      return peerStatusFromHost(status);
    },

    async peerStop() {
      // Nothing to disconnect short of stopping the node, which is the node's own
      // button (`bridge.stop()`), not the peer's.
      return peerStatusFromHost(await hostStatus());
    },

    async peerSetContribute() {
      // Contribute is a store option on the relay's peer; the host has no store.
      return peerStatusFromHost(await hostStatus());
    },

    async publishBlob(input: FreenetPublishInput) {
      const result = await call('publish', () =>
        bridge.put({ bytes: input.ciphertext, key: input.storageKey }),
      );
      return {
        storageKey: input.storageKey,
        contentHash: input.contentHash,
        freenetUri: result.uri,
        freenetPending: false,
        publishedAt: new Date().toISOString(),
      };
    },

    hotRecord,

    async pullHot(farmId) {
      const record = await hotRecord(farmId);
      if (!record) {
        throw new FreenetTransportError('not-found', 'no indexed Hot URI on this device');
      }
      return pullByUri({
        farmId,
        kind: 'hot',
        storageKey: record.storageKey,
        freenetUri: record.freenetUri,
        contentHash: record.contentHash,
      });
    },

    pullByUri,

    async slotPublish(input: FreenetSlotPublishInput) {
      const result = await call('slot publish', () => bridge.slotPut(input));
      return { ...result, publishedAt: new Date().toISOString() };
    },

    async slotRead(instanceIdBase58) {
      const bytes = await call('slot read', () => bridge.slotGet(instanceIdBase58));
      if (!bytes?.length) {
        throw new FreenetTransportError(
          'not-found',
          'No join slot at that address yet (Opennet propagation may still be in progress)',
        );
      }
      return bytes;
    },
  };
}
