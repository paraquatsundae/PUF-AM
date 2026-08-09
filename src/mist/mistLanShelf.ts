/**
 * Wi‑Fi sync for a Freenet farm: a `.pufom` bundle, sealed, on a peer's shelf.
 *
 * The `.pufom` shelf (`src/lib/pufomSync.ts`) has always been the fast pipe —
 * seconds across the shed, no internet, LWW merge on arrival — and a Freenet
 * farm could never use it, because every one of its routes wants a Firebase ID
 * token this farm has no account to mint. Freenet was left carrying traffic it
 * is bad at: a PUT is minutes of work through a laptop-only `fdev`.
 *
 * So the same bundle goes over the same Wi‑Fi, AEAD-sealed with the FarmSeed
 * before it leaves this device. The hub stores bytes it cannot read, which is
 * what lets the route skip an identity check the farm cannot satisfy — see
 * `server/mistLanShelfRoutes.ts`.
 *
 * Two properties are load-bearing and worth stating plainly:
 *
 * - **It merges, it does not replace.** Arrival runs `applyPufomBundle`, the
 *   same last-writer-wins merge a cloud farm's LAN pull uses, so a device with
 *   its own morning's diary keeps it. The Freenet Hot path cannot say that —
 *   `rehydrateLocalFarmFromHot` replaces each kind wholesale — which is why
 *   this is the pipe auto-sync is allowed to run unattended and Freenet is not.
 * - **It leaves the Freenet publish path alone.** Nothing here touches
 *   `hot/current`, bones, join tickets or slots. Send and join are unchanged.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9
 */

import { hexToBytes, hkdfSha256, MIST_HKDF_SALT } from '../../units/mist-freenet/src/farm-seed.ts';
import { sha256Hex } from '../../units/mist-freenet/src/index.ts';
import {
  getSubtleCrypto,
  hasSubtleCrypto,
} from '../../units/mist-freenet/src/subtle-crypto.ts';
import type { PufomBundleV1 } from '../../shared/sync/pufomBundle';
import { apiFetch } from '../lib/apiBase.ts';
import { syncApiUrl } from '../lib/mdnsPeers.ts';
import {
  applyPufomBundle,
  buildPufomBundle,
  type ApplyPufomResult,
} from '../lib/pufomSync.ts';
import { decodePufomBytes, encodePufomBundle } from '../lib/pufomCodec.ts';
import { hasMistDeviceSession, loadMistDeviceSession } from './mistDeviceSession.ts';

/**
 * Its own HKDF label rather than the hot contract's.
 *
 * Same FarmSeed, different job: reusing `freenet-hot` would put two unrelated
 * plaintext shapes under one key for no benefit, and a shelf blob that happened
 * to decrypt as a HotState would be a confusing failure rather than a clean one.
 */
export const LAN_SHELF_HKDF_INFO = 'lan-shelf-v1';

const HASH_HEADER = 'x-puf-content-hash';
const DEVICE_HEADER = 'x-puf-device-label';

/** A Freenet PUT is minutes; this is a file copy across the shed. */
const SHELF_TIMEOUT_MS = 30_000;

type SealedEnvelope = { v: 1; alg: 'aes-256-gcm'; iv: string; ct: string };

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function shelfKey(farmSeed: Uint8Array): Promise<CryptoKey> {
  const raw = await hkdfSha256(farmSeed, MIST_HKDF_SALT, LAN_SHELF_HKDF_INFO, 32);
  return getSubtleCrypto().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function sealForLanShelf(
  plaintext: Uint8Array,
  farmSeed: Uint8Array,
): Promise<Uint8Array> {
  if (!hasSubtleCrypto()) {
    throw new Error('This device has no Web Crypto, so it cannot seal a farm for the Wi‑Fi shelf.');
  }
  const key = await shelfKey(farmSeed);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await getSubtleCrypto().encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const envelope: SealedEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

export async function unsealFromLanShelf(
  sealed: Uint8Array,
  farmSeed: Uint8Array,
): Promise<Uint8Array> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(sealed));
  } catch {
    throw new Error('The Wi‑Fi shelf returned something that is not a sealed farm bundle.');
  }
  const envelope = parsed as Partial<SealedEnvelope>;
  if (envelope?.v !== 1 || envelope.alg !== 'aes-256-gcm' || !envelope.iv || !envelope.ct) {
    throw new Error('The Wi‑Fi shelf returned something that is not a sealed farm bundle.');
  }
  const key = await shelfKey(farmSeed);
  const plain = await getSubtleCrypto().decrypt(
    { name: 'AES-GCM', iv: hexToBytes(envelope.iv) },
    key,
    hexToBytes(envelope.ct),
  );
  return new Uint8Array(plain);
}

/**
 * What is in this farm, ignoring when it was exported and by whom.
 *
 * The seal takes a fresh nonce every time and `exportedAt` moves on every
 * build, so neither the sealed bytes nor the bundle bytes can answer "has
 * anything actually changed since the shelf was last written". This can, and
 * that is what stops an idle farm re-uploading itself on every tick.
 */
export function stablePufomDigest(bundle: PufomBundleV1): string {
  const payload = JSON.stringify({
    farmId: bundle.farmId,
    geometry: bundle.geometry,
    issues: bundle.issues,
    issuesArchive: bundle.issuesArchive,
    diary: bundle.diary,
  });
  return sha256Hex(new TextEncoder().encode(payload));
}

async function farmSeedBytes(): Promise<Uint8Array> {
  const session = await loadMistDeviceSession();
  if (!session) {
    throw new Error('Unlock this farm on this device before syncing it over Wi‑Fi.');
  }
  return hexToBytes(session.farmSeedHex);
}

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'PUF-AM';
  return navigator.userAgent.slice(0, 60);
}

export type MistLanShelfMeta = {
  farmId: string;
  contentHash: string;
  updatedAt: string;
  deviceLabel: string;
  bytes: number;
};

/** What the peer holds, or `null` when it holds nothing for this farm. */
export async function fetchMistLanShelfMeta(farmId: string): Promise<MistLanShelfMeta | null> {
  const res = await apiFetch(syncApiUrl(`/api/sync/mist/${encodeURIComponent(farmId)}/meta`), {
    timeoutMs: 6000,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The Wi‑Fi shelf answered ${res.status}.`);
  return (await res.json()) as MistLanShelfMeta;
}

export type MistLanPushResult = { bytes: number; contentHash: string };

/** Seal this device's farm and leave it on the peer's shelf. */
export async function pushSealedFarmToLan(
  farmId: string,
  opts?: { farmName?: string; bundle?: PufomBundleV1 },
): Promise<MistLanPushResult> {
  const farmSeed = await farmSeedBytes();
  const bundle = opts?.bundle ?? (await buildPufomBundle(farmId, { farmName: opts?.farmName }));
  const contentHash = stablePufomDigest(bundle);
  const sealed = await sealForLanShelf(await encodePufomBundle(bundle), farmSeed);

  const res = await apiFetch(syncApiUrl(`/api/sync/mist/${encodeURIComponent(farmId)}`), {
    method: 'POST',
    timeoutMs: SHELF_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/octet-stream',
      [HASH_HEADER]: contentHash,
      [DEVICE_HEADER]: deviceLabel(),
    },
    body: sealed as unknown as BodyInit,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `The Wi‑Fi shelf refused the farm (${res.status}).`);
  }
  return { bytes: sealed.byteLength, contentHash };
}

export type MistLanPullResult = {
  applied: ApplyPufomResult;
  contentHash: string;
  updatedAt: string;
};

/** Take what the peer is holding and merge it into this device. */
export async function pullSealedFarmFromLan(farmId: string): Promise<MistLanPullResult | null> {
  const farmSeed = await farmSeedBytes();
  const res = await apiFetch(syncApiUrl(`/api/sync/mist/${encodeURIComponent(farmId)}`), {
    timeoutMs: SHELF_TIMEOUT_MS,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The Wi‑Fi shelf answered ${res.status}.`);

  const sealed = new Uint8Array(await res.arrayBuffer());
  if (!sealed.byteLength) return null;

  const plain = await unsealFromLanShelf(sealed, farmSeed);
  const bundle = await decodePufomBytes(plain);
  const applied = await applyPufomBundle(bundle, farmId);

  return {
    applied,
    contentHash: res.headers.get(HASH_HEADER) || '',
    updatedAt: res.headers.get('X-Pufom-Updated-At') || new Date().toISOString(),
  };
}

export type MistLanSyncResult = {
  pulled: MistLanPullResult | null;
  pushed: MistLanPushResult | null;
  /** True when the shelf already held exactly what this device would have sent. */
  alreadyCurrent: boolean;
};

/**
 * One round trip: take what the peer has, then leave the union behind.
 *
 * Pull first so the push carries both sides — `applyPufomBundle` has already
 * merged the peer's copy into local stores by the time the bundle is rebuilt,
 * so the shelf converges after one pass rather than ping-ponging. The push is
 * skipped when the digest says the shelf already holds this exact farm, which
 * is the normal case on a farm nobody has touched.
 */
export async function syncSealedFarmOverLan(
  farmId: string,
  opts?: { farmName?: string },
): Promise<MistLanSyncResult> {
  if (!hasMistDeviceSession()) {
    throw new Error('Unlock this farm on this device before syncing it over Wi‑Fi.');
  }

  const before = await fetchMistLanShelfMeta(farmId).catch(() => null);
  const pulled = before ? await pullSealedFarmFromLan(farmId) : null;

  const bundle = await buildPufomBundle(farmId, { farmName: opts?.farmName });
  const digest = stablePufomDigest(bundle);
  if (before && before.contentHash === digest) {
    return { pulled, pushed: null, alreadyCurrent: true };
  }

  const pushed = await pushSealedFarmToLan(farmId, { ...opts, bundle });
  return { pulled, pushed, alreadyCurrent: false };
}
