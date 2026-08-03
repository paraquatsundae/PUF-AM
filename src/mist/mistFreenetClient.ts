/**
 * Browser client for the server-hosted Freenet peer (workshop).
 */

import { hotKey, type FreenetPeerStatus } from '../../units/mist-freenet/src/index.ts';
import { apiUrl } from '../lib/apiBase.ts';
import { getMistStoreForHotBridge, publishLocalFarmToMistHot } from './mistHotBridge.ts';

async function mistFreenetFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
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

export type { FreenetPeerStatus };

export async function fetchFreenetPeerStatus(): Promise<FreenetPeerStatus> {
  return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/status');
}

export async function startFreenetPeer(options?: { contribute?: boolean }): Promise<FreenetPeerStatus> {
  return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/start', {
    method: 'POST',
    body: JSON.stringify({ contribute: options?.contribute ?? false }),
  });
}

export async function stopFreenetPeer(): Promise<FreenetPeerStatus> {
  return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function setFreenetPeerContribute(enabled: boolean): Promise<FreenetPeerStatus> {
  return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/contribute', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export type FreenetHotPublishResult = {
  storageKey: string;
  contentHash: string;
  freenetUri?: string;
  freenetPending?: boolean;
  publishedAt: string;
};

/** Read encrypted hot/current bytes from local IndexedDB mist store. */
export async function readLocalHotCiphertext(
  farmId: string,
): Promise<{ storageKey: string; ciphertext: Uint8Array; contentHash: string } | null> {
  const store = await getMistStoreForHotBridge();
  if (!store) return null;

  const storageKey = hotKey(farmId, 'current');
  const entry = await store.get(storageKey);
  if (!entry) return null;

  return {
    storageKey,
    ciphertext: entry.ciphertext,
    contentHash: entry.meta.content_hash,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Publish local Hot to Freenet via server peer.
 * Ensures IndexedDB hot/current exists first (encrypts via mistHotBridge).
 */
export async function publishHotToFreenet(farmId: string): Promise<FreenetHotPublishResult> {
  await publishLocalFarmToMistHot(farmId);
  const local = await readLocalHotCiphertext(farmId);
  if (!local) {
    throw new Error('No local hot/current — publish local diary/issues first');
  }

  return mistFreenetFetch<FreenetHotPublishResult>(
    `/api/mist/freenet/hot/publish/${encodeURIComponent(farmId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        ciphertextBase64: bytesToBase64(local.ciphertext),
        contentHash: local.contentHash,
      }),
    },
  );
}

export type FreenetHotPullResult = {
  storageKey: string;
  contentHash: string;
  mergedToLocal: boolean;
};

/** Pull hot/current from Freenet and merge into local IndexedDB mist store. */
export async function pullHotFromFreenet(farmId: string): Promise<FreenetHotPullResult> {
  const remote = await mistFreenetFetch<{
    storageKey: string;
    ciphertextBase64: string;
    contentHash: string;
  }>(`/api/mist/freenet/hot/${encodeURIComponent(farmId)}`);

  const store = await getMistStoreForHotBridge();
  if (!store) {
    throw new Error('Mist device session required to merge Hot into local IndexedDB');
  }

  const ciphertext = base64ToBytes(remote.ciphertextBase64);
  await store.put(remote.storageKey, ciphertext, {
    kind: 'hot',
    content_hash: remote.contentHash,
    size: ciphertext.byteLength,
  });

  return {
    storageKey: remote.storageKey,
    contentHash: remote.contentHash,
    mergedToLocal: true,
  };
}
