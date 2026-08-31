/**
 * Short join ticket over Freenet — the half that needs no owner's Wi‑Fi.
 *
 * The LAN shelf answers a ticket by asking the owner's laptop. This answers it by
 * asking **Opennet**, at an address both machines derive on their own:
 *
 * ```text
 * PUF-K7M2-9Q4X + FarmSeed  →  slot id  →  contract instance  →  sealed manifest
 * ```
 *
 * The FarmSeed is in the derivation on purpose. A joiner has it after FarmCode
 * recovery, and requiring it means a ticket overheard on its own points nowhere:
 * the network never sees a value derived from the ticket in the clear, and the
 * manifest at the far end is AEAD-sealed under a key derived from the same pair.
 *
 * **What still has to be true for this to work:** the joining device needs a
 * Freenet node of its own — the bundled one in the AppImage, or `freenet network`
 * beside `npm run dev`. This lifts the requirement to be on the *owner's* Wi‑Fi,
 * not the requirement to be on a network at all. A tablet with no hub is still a
 * tablet that cannot reach Opennet.
 *
 * @see Plans/MIST_TWO_FEDORA_FREENET.md § Freenet slot contract
 * @see units/mist-freenet/contracts/slot-contract — the contract at the far end
 */

import {
  decodeJoinSlotState,
  deriveJoinSlotAddress,
  deriveJoinSlotSigningSeed,
  encodeJoinSlotState,
  joinSlotSequence,
} from '../../units/mist-freenet/src/freenet02-slot.ts';
import {
  decryptJoinSlotManifest,
  encryptJoinSlotManifest,
} from '../../units/mist-freenet/src/join-slot-crypto.ts';
import { hexToBytes } from '../../units/mist-freenet/src/farm-seed.ts';
import {
  isJoinManifestExpired,
  normalizeJoinTicket,
  parseJoinManifestV2,
  type JoinManifestV2,
  type JoinRole,
} from '../../shared/sync/joinTicket.ts';
import { encodeFreenet02Uri } from '../../units/mist-freenet/src/freenet02-uri.ts';
import { apiFetch, apiHubMissing, mistFreenetApiUrl, NO_API_HUB_MESSAGE } from '../lib/apiBase.ts';
import {
  localFreenetSearchBudgetMs,
  readLocalFreenetBlob,
  shouldUseLocalFreenetForReads,
} from './freenetLocalNode.ts';
import { loadMistDeviceSession } from './mistDeviceSession.ts';

/** Thrown when the slot could not be read, and a different resolver might do better. */
export class JoinSlotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoinSlotUnavailableError';
  }
}

/** Thrown when the slot answered but points somewhere the joiner must not follow. */
export class JoinSlotMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoinSlotMismatchError';
  }
}

/**
 * The FarmSeed for slot derivation.
 *
 * Uncached, matching `mistBonesBridge` rather than the Hot bridge: publishing or
 * joining happens once, so one PBKDF2 is cheaper than another copy of the seed
 * kept alive in module scope.
 */
async function loadFarmSeed(devicePin?: string): Promise<Uint8Array> {
  const session = await loadMistDeviceSession(devicePin);
  if (!session) {
    throw new JoinSlotUnavailableError(
      'Unlock this device (device PIN) before using a join ticket over Freenet — the slot ' +
        'address is derived from the FarmCode.',
    );
  }
  return hexToBytes(session.farmSeedHex);
}

async function slotFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  if (apiHubMissing()) throw new JoinSlotUnavailableError(NO_API_HUB_MESSAGE);

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
    throw new JoinSlotUnavailableError(
      `Could not reach the Freenet node on this device.${reason ? ` ${reason}` : ''} ` +
        'A join ticket over Freenet needs a node here — start it from Settings → Mist workshop.',
    );
  }

  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new JoinSlotUnavailableError(body.error || `Freenet slot API ${res.status}`);
  }
  return body;
}

/**
 * The slot's bytes, from whichever node this device can actually reach.
 *
 * A Freenet node app on this tablet is asked first. It is the same GET a hub
 * would make, minus the hub: no pairing, no shed Wi‑Fi, and no second machine
 * that has to be awake. When there is no such node — or it has not found the
 * slot, which is ordinary for the first few minutes after a publish — the hub
 * answers exactly as before.
 *
 * Both routes are tried when both exist, because "my node has not seen it yet"
 * and "no node here" are different failures and only the second one is fatal.
 */
async function readJoinSlotState(
  instanceIdBase58: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const hubAvailable = !apiHubMissing();
  let localReason: string | null = null;

  if (await shouldUseLocalFreenetForReads()) {
    try {
      const bytes = await readLocalFreenetBlob(encodeFreenet02Uri(instanceIdBase58), {
        deadlineMs: localFreenetSearchBudgetMs(hubAvailable),
        ...(signal ? { signal } : {}),
      });
      if (bytes?.length) return bytes;
      localReason = 'the Freenet node on this device has not found that ticket yet';
    } catch (error) {
      localReason =
        error instanceof Error ? error.message : 'the Freenet node on this device did not answer';
    }
  }

  if (!hubAvailable) {
    if (!localReason) throw new JoinSlotUnavailableError(NO_API_HUB_MESSAGE);
    throw new JoinSlotUnavailableError(
      `${localReason.charAt(0).toUpperCase()}${localReason.slice(1)}. A freshly sent farm takes a ` +
        'few minutes to spread — try again shortly, or join on the same Wi‑Fi as the farm owner.',
    );
  }

  let body: { stateBase64?: string };
  try {
    body = await slotFetch<{ stateBase64?: string }>(
      `/api/mist/freenet/slot/${encodeURIComponent(instanceIdBase58)}`,
      { ...(signal ? { signal } : {}) },
    );
  } catch (error) {
    if (!localReason) throw error;
    const hubReason = error instanceof Error ? error.message : 'the hub did not answer';
    throw new JoinSlotUnavailableError(
      `${localReason}, and ${hubReason.charAt(0).toLowerCase()}${hubReason.slice(1)}`,
    );
  }

  if (!body.stateBase64) {
    throw new JoinSlotUnavailableError('The Freenet slot for that ticket came back empty.');
  }
  return base64ToBytes(body.stateBase64);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export type PublishJoinSlotInput = {
  ticket: string;
  farmId: string;
  hotUri: string;
  bonesUri: string;
  role: JoinRole;
  permissions?: Record<string, boolean | number | string>;
  expires?: string;
  hotContentHash?: string;
  bonesContentHash?: string;
  devicePin?: string;
};

export type PublishJoinSlotResult = {
  /** `FN02@…` for the slot instance — stable across re-publishes of the same ticket. */
  uri: string;
  instanceIdBase58: string
  /** `put` on first publish, `update` when refreshing a slot the node already had. */
  mode: 'put' | 'update';
};

/**
 * Owner side — write the join manifest into this ticket's slot on Freenet.
 *
 * Sealed and signed here, in the page, so the Express hub moves bytes it cannot
 * read. The manifest is the same `JoinManifestV2` the LAN shelf stores, which is
 * what lets a joiner take either route and get the same farm.
 */
export async function publishJoinTicketToFreenetSlot(
  input: PublishJoinSlotInput,
): Promise<PublishJoinSlotResult> {
  const canonical = normalizeJoinTicket(input.ticket);
  if (!canonical) {
    throw new Error('Cannot publish a Freenet slot for a malformed join ticket');
  }

  const farmSeed = await loadFarmSeed(input.devicePin);
  const address = await deriveJoinSlotAddress(farmSeed, canonical);
  const signingSeed = await deriveJoinSlotSigningSeed(farmSeed);

  const manifest: JoinManifestV2 = {
    v: 2,
    farmId: input.farmId,
    hotUri: input.hotUri,
    bonesUri: input.bonesUri,
    role: input.role,
    ...(input.permissions ? { permissions: input.permissions } : {}),
    ...(input.expires ? { expires: input.expires } : {}),
    ticket: canonical,
    ...(input.hotContentHash ? { hotContentHash: input.hotContentHash } : {}),
    ...(input.bonesContentHash ? { bonesContentHash: input.bonesContentHash } : {}),
  };

  const payload = await encryptJoinSlotManifest(
    new TextEncoder().encode(JSON.stringify(manifest)),
    farmSeed,
    canonical,
  );

  const state = encodeJoinSlotState({
    slotId: address.slotId,
    signingSeed,
    seq: joinSlotSequence(),
    payload,
  });

  return slotFetch<PublishJoinSlotResult>('/api/mist/freenet/slot/publish', {
    method: 'POST',
    body: JSON.stringify({
      parametersBase64: bytesToBase64(address.parameters),
      stateBase64: bytesToBase64(state),
      instanceIdBase58: address.instanceIdBase58,
    }),
  });
}

export type ResolvedFreenetSlot = {
  manifest: JoinManifestV2;
  instanceIdBase58: string;
};

/**
 * Joiner side — read the manifest out of this ticket's slot.
 *
 * The signature is checked here as well as on the network. The contract refuses to
 * store an unsigned state, but these bytes arrived from whichever peer answered,
 * and a peer that skipped validation is exactly what the check is for.
 */
export async function resolveJoinTicketFromFreenetSlot(
  ticket: string,
  farmId: string,
  options?: { devicePin?: string; signal?: AbortSignal },
): Promise<ResolvedFreenetSlot> {
  const canonical = normalizeJoinTicket(ticket);
  if (!canonical) {
    throw new JoinSlotMismatchError('That join ticket should look like PUF-K7M2-9Q4X.');
  }

  const farmSeed = await loadFarmSeed(options?.devicePin);
  const address = await deriveJoinSlotAddress(farmSeed, canonical);

  const state = await readJoinSlotState(address.instanceIdBase58, options?.signal);

  let payload: Uint8Array;
  try {
    ({ payload } = decodeJoinSlotState(state, {
      slotId: address.slotId,
      verifyingKey: address.verifyingKey,
    }));
  } catch (error) {
    // A slot address is derived from this farm's own seed, so bytes that do not
    // verify are not a wrong-farm mix-up — something answered for an address only
    // this farm can compute. Refuse rather than fall through to another resolver.
    const reason = error instanceof Error ? error.message : 'unknown';
    throw new JoinSlotMismatchError(
      `The Freenet slot for that ticket is not signed by this farm (${reason}).`,
    );
  }

  let manifest: JoinManifestV2 | null;
  try {
    const plain = await decryptJoinSlotManifest(payload, farmSeed, canonical);
    manifest = parseJoinManifestV2(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw new JoinSlotMismatchError(
      'The Freenet slot for that ticket could not be opened with this FarmCode.',
    );
  }

  if (!manifest) {
    throw new JoinSlotUnavailableError('The Freenet slot held a join manifest we cannot read.');
  }
  if (manifest.farmId !== farmId) {
    throw new JoinSlotMismatchError(
      'That join ticket belongs to a different farm than the FarmCode you recovered with.',
    );
  }
  // Nothing prunes a slot the way a hub prunes its shelf, so expiry is the
  // joiner's job here. An expired ticket that still resolves is a ticket that was
  // never really revocable.
  if (isJoinManifestExpired(manifest)) {
    throw new JoinSlotMismatchError(
      'That join ticket has expired. Ask the farm owner to send the farm again for a fresh one.',
    );
  }

  return { manifest, instanceIdBase58: address.instanceIdBase58 };
}
