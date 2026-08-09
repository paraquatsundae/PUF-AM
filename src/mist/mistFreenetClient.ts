/**
 * Browser client for the server-hosted Freenet peer (workshop).
 */

import {
  bonesKey,
  hotKey,
  sha256Hex,
  type FreenetPeerStatus,
} from '../../units/mist-freenet/src/index.ts';
import { normalizeMistFreenetUri } from '../../units/mist-freenet/src/freenet-uri-normalize.ts';
import {
  DEFAULT_JOIN_ROLE,
  defaultJoinTicketExpiry,
  mintJoinTicket,
  type JoinRole,
} from '../../shared/sync/joinTicket.ts';
import {
  buildJoinPermissions,
  type JoinPreset,
  type JoinPresetId,
} from '../../shared/sync/joinGrant.ts';
import { apiFetch, apiHubMissing, mistFreenetApiUrl, NO_API_HUB_MESSAGE } from '../lib/apiBase.ts';
import { BONES_FARM_GEOMETRY_ASSET_ID } from './bonesGeometry.ts';
import {
  localFreenetSearchBudgetMs,
  readLocalFreenetBlob,
  useLocalFreenetForReads,
} from './freenetLocalNode.ts';
import { publishLocalGeometryToMistBones, readLocalBonesCiphertext } from './mistBonesBridge.ts';
import { getMistStoreForHotBridge, publishLocalFarmToMistHot } from './mistHotBridge.ts';
import { buildJoinTicketV1, formatJoinTicket, type MistJoinTicketV1 } from './mistJoinTicket.ts';
import { LanJoinTicketResolver, registerJoinTicketOnLan } from './joinTicketResolver.ts';
import { publishJoinTicketToFreenetSlot } from './joinSlotFreenet.ts';
import {
  saveFreenetBonesUri,
  saveFreenetHotUri,
  saveJoinTicketForFarm,
} from './mistHotPublishMeta.ts';

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

export type { FreenetPeerStatus };

export async function fetchFreenetPeerStatus(): Promise<FreenetPeerStatus> {
  // Polled on a timer behind a readiness label, so it must not be the thing that
  // makes the card feel hung when the hub is off.
  return mistFreenetFetch<FreenetPeerStatus>('/api/mist/freenet/peer/status', {
    timeoutMs: 6000,
  });
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
  remote: { storageKey: string; ciphertext: Uint8Array; contentHash: string },
): Promise<void> {
  const store = await getMistStoreForHotBridge();
  if (!store) {
    throw new Error('Mist device session required to merge Hot into local IndexedDB');
  }

  await store.put(remote.storageKey, remote.ciphertext, {
    kind: 'hot',
    content_hash: remote.contentHash,
    size: remote.ciphertext.byteLength,
  });
}

/**
 * Farm ciphertext off the Freenet node on this device, when there is one.
 *
 * `null` means "not this route" — no node here, or a node that has not found the
 * blob — and the caller falls through to the hub. A thrown error means the node
 * answered with something wrong, which is not a thing to paper over.
 *
 * The hash is checked here rather than taken on trust. The server route labels
 * whatever it fetched with the hash the manifest claimed; in the page we hold the
 * manifest the owner signed, so a blob that does not match it is a blob some peer
 * substituted, and the AEAD open that follows would fail anyway with a message
 * about the FarmCode rather than about the network.
 */
async function readFarmBlobFromLocalNode(
  freenetUri: string,
  contentHash?: string,
): Promise<{ ciphertext: Uint8Array; contentHash: string } | null> {
  if (!(await useLocalFreenetForReads())) return null;

  let bytes: Uint8Array | null;
  try {
    bytes = await readLocalFreenetBlob(normalizeMistFreenetUri(freenetUri), {
      deadlineMs: localFreenetSearchBudgetMs(!apiHubMissing()),
    });
  } catch {
    // Whatever went wrong with this device's node, a hub may still answer.
    return null;
  }
  if (!bytes?.length) return null;

  const actual = sha256Hex(bytes);
  if (contentHash && actual !== contentHash) {
    throw new Error(
      `Freenet returned the wrong bytes for ${freenetUri} — the farm owner's ticket says ` +
        `${contentHash.slice(0, 12)}… and this device's node fetched ${actual.slice(0, 12)}…`,
    );
  }

  return { ciphertext: bytes, contentHash: actual };
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
export async function publishHotToFreenet(
  farmId: string,
  devicePin?: string,
): Promise<FreenetHotPublishResult> {
  await publishLocalFarmToMistHot(farmId, devicePin ? { devicePin } : undefined);
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

  await mergeHotCiphertextToLocal(farmId, {
    storageKey: remote.storageKey,
    ciphertext: base64ToBytes(remote.ciphertextBase64),
    contentHash: remote.contentHash,
  });

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
  const local = await readFarmBlobFromLocalNode(freenetUri, contentHash);
  if (local) {
    const storageKey = hotKey(farmId, 'current');
    await mergeHotCiphertextToLocal(farmId, { storageKey, ...local });
    saveFreenetHotUri(farmId, { freenetUri, contentHash: local.contentHash, storageKey });
    return { storageKey, contentHash: local.contentHash, freenetUri, mergedToLocal: true };
  }

  const remote = await mistFreenetFetch<{
    storageKey: string;
    ciphertextBase64: string;
    contentHash: string;
    freenetUri: string;
  }>(`/api/mist/freenet/hot/pull-by-uri/${encodeURIComponent(farmId)}`, {
    method: 'POST',
    body: JSON.stringify({ freenetUri, contentHash }),
  });

  await mergeHotCiphertextToLocal(farmId, {
    storageKey: remote.storageKey,
    ciphertext: base64ToBytes(remote.ciphertextBase64),
    contentHash: remote.contentHash,
  });

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
  remote: { storageKey: string; ciphertext: Uint8Array; contentHash: string },
): Promise<void> {
  const store = await getMistStoreForHotBridge();
  if (!store) {
    throw new Error('Mist device session required to merge bones into local IndexedDB');
  }

  await store.put(remote.storageKey, remote.ciphertext, {
    kind: 'bones',
    content_hash: remote.contentHash,
    size: remote.ciphertext.byteLength,
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
export async function publishBonesToFreenet(
  farmId: string,
  devicePin?: string,
): Promise<FreenetBonesPublishResult> {
  await publishLocalGeometryToMistBones(farmId, devicePin);
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
  const local = await readFarmBlobFromLocalNode(freenetUri, contentHash);
  if (local) {
    const storageKey = bonesKey(farmId, BONES_FARM_GEOMETRY_ASSET_ID);
    await mergeBonesCiphertextToLocal(farmId, { storageKey, ...local });
    saveFreenetBonesUri(farmId, { freenetUri, contentHash: local.contentHash, storageKey });
    return { storageKey, contentHash: local.contentHash, freenetUri, mergedToLocal: true };
  }

  const remote = await mistFreenetFetch<{
    storageKey: string;
    ciphertextBase64: string;
    contentHash: string;
    freenetUri: string;
  }>(`/api/mist/freenet/bones/pull-by-uri/${encodeURIComponent(farmId)}`, {
    method: 'POST',
    body: JSON.stringify({ freenetUri, contentHash }),
  });

  await mergeBonesCiphertextToLocal(farmId, {
    storageKey: remote.storageKey,
    ciphertext: base64ToBytes(remote.ciphertextBase64),
    contentHash: remote.contentHash,
  });

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
  /**
   * `PUF-K7M2-9Q4X` — what the operator actually reads out to the joiner.
   *
   * Present once **at least one** route can answer for it: the LAN shelf, read
   * back through the same lookup a joiner uses, or a Freenet slot this device
   * published. A minted ticket no route answers for is indistinguishable from a
   * good one by eye and dies as a flat 404 on the joiner, so absent beats
   * untrustworthy here.
   */
  shortTicket?: string;
  shortTicketRole: JoinRole;
  /** Preset the ticket was minted against, when the caller named one. */
  shortTicketPreset?: JoinPresetId;
  shortTicketExpires?: string;
  /**
   * Why `shortTicket` is absent, or which of the two routes is missing when it is
   * present. The raw FN02 ticket above always works, so a half-published ticket is
   * a downgrade rather than a failed publish.
   */
  shortTicketError?: string;
  /** Ticket is on this device's LAN shelf and read back through a joiner's lookup. */
  shortTicketOnLan: boolean;
  /**
   * Ticket is in a Freenet slot, so it resolves without the owner's Wi‑Fi.
   *
   * `put` on a first publish, `update` when refreshing the slot for a ticket that
   * already had one. Not read back: a GET seconds after a PUT normally misses while
   * Opennet is still spreading it, and reporting that as a failure would be wrong.
   */
  shortTicketOnFreenet?: 'put' | 'update';
};

/**
 * Publish Hot + bones to Freenet, then mint a short ticket and put the manifest
 * where a joiner can find it (laptop A).
 *
 * Two places, on purpose. The **LAN shelf** is instant and works with no internet,
 * so it stays the fast path. The **Freenet slot** is what makes the ticket resolve
 * when this laptop is shut or the joiner is nowhere near this Wi‑Fi. Either one on
 * its own is enough to hand the ticket over; both is the normal case.
 *
 * Freenet still carries the farm itself; the ticket only carries the *addresses*.
 * If both routes fail the publish stands and the raw FN02 ticket under Advanced
 * remains the handoff.
 */
export async function publishFarmToFreenet(
  farmId: string,
  options?: {
    /**
     * What the ticket grants. A preset sets both the wire role and the module
     * list the joiner ends up with; `role` alone still works and lands the
     * joiner on that role's defaults, which is what every ticket minted before
     * presets did.
     */
    preset?: JoinPreset;
    role?: JoinRole;
    permissions?: Record<string, boolean | number | string>;
    expires?: string;
    /**
     * Unlocks the FarmSeed on a device that has not been opened in this tab.
     * Needed for the Freenet slot, whose address is derived from the seed, and
     * for the Hot and bones blobs, which are sealed under it.
     */
    devicePin?: string;
    /**
     * Who the ticket is for, in the owner's words. Kept on the hub's own shelf
     * for the People list and deliberately kept out of the manifest, so a
     * joiner never receives it and nothing about it reaches Freenet.
     */
    label?: string;
  },
): Promise<PublishFarmToFreenetResult> {
  const hot = await publishHotToFreenet(farmId, options?.devicePin);
  const bones = await publishBonesToFreenet(farmId, options?.devicePin);

  if (!hot.freenetUri || !bones.freenetUri) {
    throw new Error('Freenet publish incomplete — wait for peer connection and retry');
  }

  const joinTicket = buildJoinTicketV1({
    hotUri: hot.freenetUri,
    bonesUri: bones.freenetUri,
    hotContentHash: hot.contentHash,
    bonesContentHash: bones.contentHash,
  });

  const minted = mintJoinTicket();
  const preset = options?.preset;
  const role = preset?.role ?? options?.role ?? DEFAULT_JOIN_ROLE;
  const expires = options?.expires ?? defaultJoinTicketExpiry();
  const permissions =
    options?.permissions ?? (preset ? buildJoinPermissions(preset) : undefined);

  const manifestFields = {
    ticket: minted,
    farmId,
    hotUri: hot.freenetUri,
    bonesUri: bones.freenetUri,
    role,
    ...(permissions ? { permissions } : {}),
    expires,
    hotContentHash: hot.contentHash,
    bonesContentHash: bones.contentHash,
  };

  let shortTicketOnLan = false;
  let lanError: string | undefined;
  try {
    await registerJoinTicketOnLan({
      ...manifestFields,
      ...(options?.label ? { label: options.label } : {}),
    });
    // A 200 on the POST says the hub accepted the manifest, not that the shelf the
    // joiner reads now holds it. Ask for the ticket back through the LAN resolver
    // specifically — the default walk would fall through to Freenet and report
    // success for a shelf that is still empty.
    await new LanJoinTicketResolver().resolve(minted, farmId);
    shortTicketOnLan = true;
  } catch (error) {
    lanError = error instanceof Error ? error.message : 'the hub did not accept it';
  }

  let shortTicketOnFreenet: 'put' | 'update' | undefined;
  let freenetError: string | undefined;
  try {
    const slot = await publishJoinTicketToFreenetSlot({
      ...manifestFields,
      ...(options?.devicePin ? { devicePin: options.devicePin } : {}),
    });
    shortTicketOnFreenet = slot.mode;
  } catch (error) {
    freenetError = error instanceof Error ? error.message : 'the Freenet slot publish failed';
  }

  const shortTicket = shortTicketOnLan || shortTicketOnFreenet ? minted : undefined;
  if (shortTicket) {
    saveJoinTicketForFarm(farmId, {
      ticket: minted,
      role,
      ...(preset ? { preset: preset.id } : {}),
      expires,
    });
  }

  const shortTicketError = describeTicketRouteGap({ lanError, freenetError });

  return {
    hot,
    bones,
    joinTicket,
    joinTicketText: formatJoinTicket(joinTicket),
    ...(shortTicket ? { shortTicket } : {}),
    shortTicketRole: role,
    ...(preset ? { shortTicketPreset: preset.id } : {}),
    shortTicketExpires: expires,
    shortTicketOnLan,
    ...(shortTicketOnFreenet ? { shortTicketOnFreenet } : {}),
    ...(shortTicketError ? { shortTicketError } : {}),
  };
}

/**
 * What to tell the operator about a ticket that only half landed.
 *
 * Worth spelling out rather than reporting a bare failure: a ticket on the shelf
 * but not in a slot still works, just only on this Wi‑Fi, and a ticket in a slot
 * but not on the shelf works everywhere but takes a few minutes to become
 * findable. Those are different things to say to someone about to read eight
 * symbols out loud.
 */
function describeTicketRouteGap(input: {
  lanError?: string;
  freenetError?: string;
}): string | undefined {
  const { lanError, freenetError } = input;
  if (!lanError && !freenetError) return undefined;

  if (lanError && freenetError) {
    return `no route can answer for it — this device's hub said "${lanError}", and Freenet said "${freenetError}"`;
  }
  if (freenetError) {
    return `it works on this Wi‑Fi but not off it — the Freenet slot did not publish: ${freenetError}`;
  }
  return `it works off this Wi‑Fi but may take a few minutes to be findable — this device's hub did not take it: ${lanError}`;
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
