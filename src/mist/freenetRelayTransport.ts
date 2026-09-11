/**
 * Relay transport — `/api/mist/freenet/*` on a hub, for a client with no host.
 *
 * This is the pre-slice-B data path, unchanged in behaviour: the same routes, the
 * same bodies, the same timeouts and the same error text. It is what the
 * `npm run dev` workshop hub uses (the browser is the UI, Express is the
 * sidecar) and what a paired tablet uses through a desktop hub until the
 * Android host lands (Plans/FREENET_NETWORK_PACK.md Phase 3). On Electron the
 * host transport replaces it; `freenetTransportSelect.ts` decides.
 */

import type { FreenetPeerStatus } from '../../units/mist-freenet/src/freenet-peer.ts';
import { apiFetch, apiHubMissing, mistFreenetApiUrl, NO_API_HUB_MESSAGE } from '../lib/apiBase.ts';
import {
  FreenetTransportError,
  type FreenetFetchInput,
  type FreenetFetchedBlob,
  type FreenetHotRecord,
  type FreenetPackTransport,
  type FreenetPublishInput,
  type FreenetPublishOutcome,
  type FreenetSlotPublishInput,
  type FreenetSlotPublishOutcome,
} from './freenetPackTransport.ts';

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function mistFreenetFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  // These routes live on a laptop. A tablet with no hub would otherwise spend the
  // full TCP connect timeout on an address nothing answers and call it a fetch
  // failure — see `NO_API_HUB_MESSAGE` for what the operator can actually do.
  if (apiHubMissing()) throw new Error(NO_API_HUB_MESSAGE);

  const res = await apiFetch(mistFreenetApiUrl(path), {
    ...init,
    // A Freenet put/get is minutes of work on a cold node, so the ceiling here is
    // only there to stop a dead hub hanging forever. Callers that are just asking
    // a question pass something much shorter.
    timeoutMs: init?.timeoutMs ?? 300_000,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || `Mist Freenet API ${res.status}`);
  }
  return body;
}

/**
 * The slot routes report failure in the joiner's terms, because the joiner is
 * usually the one reading them: "nothing answered" and "nothing there yet" are
 * different sentences, and only the first one means another route might help.
 */
async function slotFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  if (apiHubMissing()) throw new FreenetTransportError('unreachable', NO_API_HUB_MESSAGE);

  let res: Response;
  try {
    res = await apiFetch(mistFreenetApiUrl(path), {
      ...init,
      // A cold Opennet node can take minutes to answer a GET for something it has
      // never seen, which is the normal case right after the owner published.
      timeoutMs: init?.timeoutMs ?? 300_000,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    throw new FreenetTransportError(
      'unreachable',
      `Could not reach the Freenet node on this device.${reason ? ` ${reason}` : ''} ` +
        'A join ticket over Freenet needs a node here — start it from Settings → Mist workshop.',
    );
  }

  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new FreenetTransportError(
      res.status === 404 ? 'not-found' : 'rejected',
      body.error || `Freenet slot API ${res.status}`,
    );
  }
  return body;
}

type RelayBlobResponse = {
  storageKey: string;
  ciphertextBase64: string;
  contentHash: string;
  freenetUri?: string;
};

function fetchedBlob(remote: RelayBlobResponse): FreenetFetchedBlob {
  return {
    storageKey: remote.storageKey,
    ciphertext: base64ToBytes(remote.ciphertextBase64),
    contentHash: remote.contentHash,
    ...(remote.freenetUri ? { freenetUri: remote.freenetUri } : {}),
  };
}

export function createRelayTransport(): FreenetPackTransport {
  return {
    kind: 'relay',

    peerStatus() {
      // Polled on a timer behind a readiness label, so it must not be the thing
      // that makes the card feel hung when the hub is off.
      return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/status', {
        timeoutMs: 6000,
      });
    },

    peerStart(options) {
      return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/start', {
        method: 'POST',
        body: JSON.stringify({ contribute: options?.contribute ?? false }),
      });
    },

    peerStop() {
      return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/stop', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },

    peerSetContribute(enabled) {
      return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/contribute', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });
    },

    publishBlob(input: FreenetPublishInput) {
      return mistFreenetFetch<FreenetPublishOutcome>(
        `/api/mist/freenet/${input.kind}/publish/${encodeURIComponent(input.farmId)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            ciphertextBase64: bytesToBase64(input.ciphertext),
            contentHash: input.contentHash,
          }),
        },
      );
    },

    /** Indexed FN02 URI on the hub's peer (404 when empty — laptop B after recover). */
    async hotRecord(farmId) {
      try {
        return await mistFreenetFetch<FreenetHotRecord>(
          `/api/mist/freenet/hot/record/${encodeURIComponent(farmId)}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('404') || message.includes('no indexed Hot URI')) return null;
        throw err;
      }
    },

    async pullHot(farmId) {
      const remote = await mistFreenetFetch<RelayBlobResponse>(
        `/api/mist/freenet/hot/${encodeURIComponent(farmId)}`,
      );
      return fetchedBlob(remote);
    },

    async pullByUri(input: FreenetFetchInput) {
      const remote = await mistFreenetFetch<RelayBlobResponse>(
        `/api/mist/freenet/${input.kind}/pull-by-uri/${encodeURIComponent(input.farmId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ freenetUri: input.freenetUri, contentHash: input.contentHash }),
        },
      );
      return fetchedBlob(remote);
    },

    slotPublish(input: FreenetSlotPublishInput) {
      return slotFetch<FreenetSlotPublishOutcome>('/api/mist/freenet/slot/publish', {
        method: 'POST',
        body: JSON.stringify({
          parametersBase64: bytesToBase64(input.parameters),
          stateBase64: bytesToBase64(input.state),
          instanceIdBase58: input.instanceIdBase58,
        }),
      });
    },

    async slotRead(instanceIdBase58, options) {
      const body = await slotFetch<{ stateBase64?: string }>(
        `/api/mist/freenet/slot/${encodeURIComponent(instanceIdBase58)}`,
        { ...(options?.signal ? { signal: options.signal } : {}) },
      );
      if (!body.stateBase64) {
        throw new FreenetTransportError(
          'not-found',
          'The Freenet slot for that ticket came back empty.',
        );
      }
      return base64ToBytes(body.stateBase64);
    },
  };
}
