/**
 * Browser client for the server-hosted Freenet peer (workshop).
 */

import { bonesKey, hotKey, type FreenetPeerStatus } from '../../units/mist-freenet/src/index.ts';
import { mistFreenetApiUrl } from '../lib/apiBase.ts';
import { publishLocalGeometryToMistBones, readLocalBonesCiphertext } from './mistBonesBridge.ts';
import { getMistStoreForHotBridge, publishLocalFarmToMistHot } from './mistHotBridge.ts';
import { buildJoinTicketV1, formatJoinTicket, type MistJoinTicketV1 } from './mistJoinTicket.ts';
import { saveFreenetBonesUri, saveFreenetHotUri } from './mistHotPublishMeta.ts';

async function mistFreenetFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(mistFreenetApiUrl(path), {
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

export type FreenetHotRecord = {
  storageKey: string;
  freenetUri: string;
  contentHash: string;
  freenetPending?: boolean;
  insertedAt?: number;
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

async function mergeHotCiphertextToLocal(
  farmId: string,
  remote: { storageKey: string; ciphertextBase64: string; contentHash: string },
): Promise<void> {
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
}

function rememberFreenetHotUri(farmId: string, result: FreenetHotPublishResult): void {
  if (!result.freenetUri) return;
  saveFreenetHotUri(farmId, {
    freenetUri: result.freenetUri,
    contentHash: result.contentHash,
    freenetPending: result.freenetPending,
    storageKey: result.storageKey,
  });
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

  const result = await mistFreenetFetch<FreenetHotPublishResult>(
    `/api/mist/freenet/hot/publish/${encodeURIComponent(farmId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        ciphertextBase64: bytesToBase64(local.ciphertext),
        contentHash: local.contentHash,
      }),
    },
  );

  rememberFreenetHotUri(farmId, result);
  return result;
}

/** Indexed FN02 URI on this device's server peer (404 when empty — laptop B after recover). */
export async function fetchFreenetHotRecord(farmId: string): Promise<FreenetHotRecord | null> {
  try {
    return await mistFreenetFetch<FreenetHotRecord>(
      `/api/mist/freenet/hot/record/${encodeURIComponent(farmId)}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('404') || message.includes('no indexed Hot URI')) return null;
    throw err;
  }
}

export type FreenetHotPullResult = {
  storageKey: string;
  contentHash: string;
  freenetUri?: string;
  mergedToLocal: boolean;
};

/** Pull hot/current from Freenet (indexed URI on this device) and merge into IndexedDB. */
export async function pullHotFromFreenet(farmId: string): Promise<FreenetHotPullResult> {
  const remote = await mistFreenetFetch<{
    storageKey: string;
    ciphertextBase64: string;
    contentHash: string;
    freenetUri?: string;
  }>(`/api/mist/freenet/hot/${encodeURIComponent(farmId)}`);

  await mergeHotCiphertextToLocal(farmId, remote);

  if (remote.freenetUri) {
    saveFreenetHotUri(farmId, {
      freenetUri: remote.freenetUri,
      contentHash: remote.contentHash,
      storageKey: remote.storageKey,
    });
  }

  return {
    storageKey: remote.storageKey,
    contentHash: remote.contentHash,
    freenetUri: remote.freenetUri,
    mergedToLocal: true,
  };
}

/**
 * Pull hot/current by pasted FN02 URI (laptop B — empty freenet-index).
 * Optional contentHash from laptop A publish line for verification.
 */
export async function pullHotFromFreenetByUri(
  farmId: string,
  freenetUri: string,
  contentHash?: string,
): Promise<FreenetHotPullResult> {
  const remote = await mistFreenetFetch<{
    storageKey: string;
    ciphertextBase64: string;
    contentHash: string;
    freenetUri: string;
  }>(`/api/mist/freenet/hot/pull-by-uri/${encodeURIComponent(farmId)}`, {
    method: 'POST',
    body: JSON.stringify({ freenetUri, contentHash }),
  });

  await mergeHotCiphertextToLocal(farmId, remote);

  saveFreenetHotUri(farmId, {
    freenetUri: remote.freenetUri,
    contentHash: remote.contentHash,
    storageKey: remote.storageKey,
  });

  return {
    storageKey: remote.storageKey,
    contentHash: remote.contentHash,
    freenetUri: remote.freenetUri,
    mergedToLocal: true,
  };
}

export type FreenetBonesPublishResult = {
  storageKey: string;
  contentHash: string;
  freenetUri?: string;
  freenetPending?: boolean;
  publishedAt: string;
};

export type FreenetBonesPullResult = {
  storageKey: string;
  contentHash: string;
  freenetUri?: string;
  mergedToLocal: boolean;
};

async function mergeBonesCiphertextToLocal(
  farmId: string,
  remote: { storageKey: string; ciphertextBase64: string; contentHash: string },
): Promise<void> {
  const store = await getMistStoreForHotBridge();
  if (!store) {
    throw new Error('Mist device session required to merge bones into local IndexedDB');
  }

  const ciphertext = base64ToBytes(remote.ciphertextBase64);
  await store.put(remote.storageKey, ciphertext, {
    kind: 'bones',
    content_hash: remote.contentHash,
    size: ciphertext.byteLength,
    version: 1,
  });
}

function rememberFreenetBonesUri(farmId: string, result: FreenetBonesPublishResult): void {
  if (!result.freenetUri) return;
  saveFreenetBonesUri(farmId, {
    freenetUri: result.freenetUri,
    contentHash: result.contentHash,
    freenetPending: result.freenetPending,
    storageKey: result.storageKey,
  });
}

/** Publish local farm-geometry bones to Freenet via server peer. */
export async function publishBonesToFreenet(farmId: string): Promise<FreenetBonesPublishResult> {
  await publishLocalGeometryToMistBones(farmId);
  const local = await readLocalBonesCiphertext(farmId);
  if (!local) {
    throw new Error('No local farm-geometry bones — draw boundaries on map first');
  }

  const result = await mistFreenetFetch<FreenetBonesPublishResult>(
    `/api/mist/freenet/bones/publish/${encodeURIComponent(farmId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        ciphertextBase64: bytesToBase64(local.ciphertext),
        contentHash: local.contentHash,
      }),
    },
  );

  rememberFreenetBonesUri(farmId, result);
  return result;
}

/** Pull farm-geometry bones by pasted FN02 URI (laptop B). */
export async function pullBonesFromFreenetByUri(
  farmId: string,
  freenetUri: string,
  contentHash?: string,
): Promise<FreenetBonesPullResult> {
  const remote = await mistFreenetFetch<{
    storageKey: string;
    ciphertextBase64: string;
    contentHash: string;
    freenetUri: string;
  }>(`/api/mist/freenet/bones/pull-by-uri/${encodeURIComponent(farmId)}`, {
    method: 'POST',
    body: JSON.stringify({ freenetUri, contentHash }),
  });

  await mergeBonesCiphertextToLocal(farmId, remote);

  saveFreenetBonesUri(farmId, {
    freenetUri: remote.freenetUri,
    contentHash: remote.contentHash,
    storageKey: remote.storageKey,
  });

  return {
    storageKey: remote.storageKey,
    contentHash: remote.contentHash,
    freenetUri: remote.freenetUri,
    mergedToLocal: true,
  };
}

export type PublishFarmToFreenetResult = {
  hot: FreenetHotPublishResult;
  bones: FreenetBonesPublishResult;
  joinTicket: MistJoinTicketV1;
  joinTicketText: string;
};

/** Publish Hot + bones to Freenet and return copyable join ticket (laptop A). */
export async function publishFarmToFreenet(farmId: string): Promise<PublishFarmToFreenetResult> {
  const hot = await publishHotToFreenet(farmId);
  const bones = await publishBonesToFreenet(farmId);

  if (!hot.freenetUri || !bones.freenetUri) {
    throw new Error('Freenet publish incomplete — wait for peer connection and retry');
  }

  const joinTicket = buildJoinTicketV1({
    hotUri: hot.freenetUri,
    bonesUri: bones.freenetUri,
    hotContentHash: hot.contentHash,
    bonesContentHash: bones.contentHash,
  });

  return {
    hot,
    bones,
    joinTicket,
    joinTicketText: formatJoinTicket(joinTicket),
  };
}

export type FetchFarmFromFreenetResult = {
  hot: FreenetHotPullResult;
  bones: FreenetBonesPullResult;
};

/** Pull Hot + bones by join ticket URIs (laptop B). */
export async function fetchFarmFromFreenetByJoinTicket(
  farmId: string,
  ticket: { hotUri: string; bonesUri: string; hotContentHash?: string; bonesContentHash?: string },
): Promise<FetchFarmFromFreenetResult> {
  const hot = await pullHotFromFreenetByUri(farmId, ticket.hotUri, ticket.hotContentHash);
  const bones = await pullBonesFromFreenetByUri(farmId, ticket.bonesUri, ticket.bonesContentHash);
  return { hot, bones };
}
