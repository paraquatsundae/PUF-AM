/**
 * Bridge: production local data (pufom_farm_local) → mist Hot contract.
 *
 * Parallel to Firestore/outbox — does not mutate cloud paths.
 * Active when a mist device session is unlocked (FarmSeed in memory).
 */

import {
  decryptHotBlob,
  encryptHotBlob,
  hotKey,
  sha256Hex,
  type HotState,
  type MistStore,
} from '../../units/mist-freenet/src/index.ts';
import { hasSubtleCrypto } from '../../units/mist-freenet/src/subtle-crypto.ts';
import { buildFarmExportJson } from '../lib/farmExport';
import { buildHotStateFromFarmExport } from './hotAdapter.ts';
import { ensureBrowserMistStore } from './createFarmStore.ts';
import {
  hasMistDeviceSession,
  loadMistDeviceSession,
  mistSessionCloudFarmId,
  mistSessionNeedsPin,
} from './mistDeviceSession.ts';
import {
  forgetUnlockedFarmSeed,
  isMistFarmSeedUnlocked,
  unlockedFarmSeed,
} from './mistFarmSeedCache.ts';
import {
  getMistHotPublishStatus,
  saveMistHotPublishStatus,
  type MistHotPublishStatus,
} from './mistHotPublishMeta.ts';
import { hexToBytes } from '../../units/mist-freenet/src/farm-seed.ts';

export type PublishMistHotOpts = {
  farmName?: string;
  devicePin?: string;
  /** When true, skip if no mist session (default). */
  auto?: boolean;
  /**
   * Hybrid farms (`Plans/FREENET_NETWORK_PACK.md` §3): build the envelope from
   * this Firestore farm's **local cache** (`pufom_farm_local` — what this device
   * has already loaded; no Firestore read is made here) while addressing and
   * sealing the Hot under the mist `farmId` the caller passed. Stamped into
   * `HotState.meta.cloud_farm_id` so a reader knows the authority lives elsewhere.
   */
  cloudFarmId?: string;
};

export type PublishMistHotResult = {
  storageKey: string;
  contentHash: string;
  recordCount: number;
  diaryCount: number;
  issueCount: number;
  issueArchiveCount: number;
  encrypted: boolean;
  publishedAt: string;
  /** Plain JSON envelope size before sealing — the number the Phase 1 budget asks for. */
  envelopeBytes: number;
  /** What actually goes to the store / Freenet. */
  sealedBytes: number;
};

export type ReadMistHotResult = {
  storageKey: string;
  hot: HotState;
  contentHash: string;
  encrypted: boolean;
};

const autoPublishTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTO_PUBLISH_DEBOUNCE_MS = 2500;

/** True when local diary/issues may be mirrored to mist Hot. */
export function isMistHotMirrorAvailable(): boolean {
  return hasMistDeviceSession();
}

/**
 * True when a publish from this device would fail for want of a device PIN, so
 * the caller should ask for one rather than let the operator press Send into an
 * error.
 *
 * A PIN-less session is sealed under a device key sitting beside it, so it
 * unlocks itself on demand and never needs asking — only a PIN session that has
 * not been opened in this tab does.
 */
export function mistPublishNeedsDevicePin(): boolean {
  if (!hasMistDeviceSession()) return false;
  return !isMistFarmSeedUnlocked() && mistSessionNeedsPin();
}

/** Open IndexedDB mist store when a device session exists (independent of FarmStore backend). */
export async function getMistStoreForHotBridge(): Promise<MistStore | null> {
  if (!hasMistDeviceSession()) return null;
  return ensureBrowserMistStore();
}

/**
 * The FarmSeed for a publish or a decrypt, or `null` when this device is still
 * sealed. Shared with `mistBonesBridge` so one unlock covers both halves of a
 * send — they used to hold separate caches, and the bones half had none at all.
 */
export async function resolveMistFarmSeed(devicePin?: string): Promise<Uint8Array | null> {
  const cached = unlockedFarmSeed();
  if (cached) return cached;
  const session = await loadMistDeviceSession(devicePin);
  if (!session) return null;
  return hexToBytes(session.farmSeedHex);
}

/**
 * What to say when the seed will not come out. A wrong PIN and a PIN never
 * asked for are different problems, and the second one is the operator's cue to
 * type it rather than to go hunting.
 */
export function farmSeedLockedError(action: string, devicePin?: string): Error {
  return new Error(
    devicePin
      ? `That device PIN did not unlock this farm — check it and try again to ${action}.`
      : `Mist device session locked — unlock to ${action}`,
  );
}

/** Clear in-memory FarmSeed (sign-out). */
export function clearCachedFarmSeedForHot(): void {
  forgetUnlockedFarmSeed();
}

function parseHotState(bytes: Uint8Array): HotState {
  return JSON.parse(new TextDecoder().decode(bytes)) as HotState;
}

async function readExistingHotState(
  store: MistStore,
  farmId: string,
  farmSeed: Uint8Array,
): Promise<HotState | null> {
  const key = hotKey(farmId, 'current');
  const entry = await store.get(key);
  if (!entry) return null;
  const plain = await decryptHotBlob(entry.ciphertext, farmSeed);
  return parseHotState(plain);
}

/**
 * Publish local diary + issues snapshot to mist Hot (`hot/current`).
 * No-op when mist device session is absent.
 */
export async function publishLocalFarmToMistHot(
  farmId: string,
  opts?: PublishMistHotOpts,
): Promise<PublishMistHotResult | null> {
  if (!isMistHotMirrorAvailable()) return null;

  const store = await getMistStoreForHotBridge();
  if (!store) return null;

  const farmSeed = await resolveMistFarmSeed(opts?.devicePin);
  if (!farmSeed) {
    if (opts?.auto) return null;
    throw farmSeedLockedError('publish Hot', opts?.devicePin);
  }

  const cloudFarmId = opts?.cloudFarmId?.trim();
  // A hybrid farm's records sit in the local cache under the *cloud* id; the
  // mirror is keyed by the mist id. Everything else about the build is shared.
  const exportBundle = await buildFarmExportJson(cloudFarmId || farmId, {
    farmName: opts?.farmName,
    source: 'mist',
    includeIssues: true,
    includeIssuesArchive: true,
  });

  const previous = await readExistingHotState(store, farmId, farmSeed);
  const hotState = buildHotStateFromFarmExport(exportBundle, {
    previous,
    defaultAuthor: exportBundle.farmName,
    farmId,
    ...(cloudFarmId ? { cloudFarmId } : {}),
  });

  const plainBytes = new TextEncoder().encode(JSON.stringify(hotState));
  const canEncrypt = hasSubtleCrypto();
  const storedBytes = canEncrypt
    ? await encryptHotBlob(plainBytes, farmSeed)
    : plainBytes;
  logHotEnvelopeSize(farmId, hotState.records.length, plainBytes.byteLength, storedBytes.byteLength, cloudFarmId);

  const storageKey = hotKey(farmId, 'current');
  const contentHash = sha256Hex(storedBytes);
  const publishedAt = new Date().toISOString();

  await store.put(storageKey, storedBytes, {
    kind: 'hot',
    content_hash: contentHash,
    size: storedBytes.byteLength,
    ts: Date.now(),
  });

  const result: PublishMistHotResult = {
    storageKey,
    contentHash,
    recordCount: hotState.records.length,
    diaryCount: exportBundle.diary.length,
    issueCount: exportBundle.issues.length,
    issueArchiveCount: exportBundle.issuesArchive.length,
    encrypted: canEncrypt,
    publishedAt,
    envelopeBytes: plainBytes.byteLength,
    sealedBytes: storedBytes.byteLength,
  };

  saveMistHotPublishStatus({
    farmId,
    ...result,
  });

  return result;
}

/**
 * Phase 1 of `Plans/FREENET_NETWORK_PACK.md` asks for the envelope size to be
 * measured before the design commits to whole-farm blobs, so every publish says
 * what it sealed — dev console only, no operator ever needs the number.
 */
function logHotEnvelopeSize(
  farmId: string,
  records: number,
  envelopeBytes: number,
  sealedBytes: number,
  cloudFarmId?: string,
): void {
  if (!import.meta.env?.DEV) return;
  console.info(
    `[mist] hot envelope ${cloudFarmId ? 'hybrid mirror' : 'farm'} ${farmId.slice(0, 12)}…: ` +
      `${records} records, ${envelopeBytes} B plain → ${sealedBytes} B sealed` +
      (cloudFarmId ? ` (cloud farm ${cloudFarmId})` : ''),
  );
}

/** Read and decrypt the current Hot blob for smoke / verification. */
export async function readMistHotCurrent(
  farmId: string,
  devicePin?: string,
): Promise<ReadMistHotResult | null> {
  if (!isMistHotMirrorAvailable()) return null;

  const store = await getMistStoreForHotBridge();
  if (!store) return null;

  const farmSeed = await resolveMistFarmSeed(devicePin);
  if (!farmSeed) {
    throw farmSeedLockedError('read Hot', devicePin);
  }

  const storageKey = hotKey(farmId, 'current');
  const entry = await store.get(storageKey);
  if (!entry) return null;

  const plain = await decryptHotBlob(entry.ciphertext, farmSeed);
  const hot = parseHotState(plain);
  const encrypted = entry.ciphertext.byteLength !== plain.byteLength;

  return {
    storageKey,
    hot,
    contentHash: entry.meta.content_hash,
    encrypted,
  };
}

/**
 * Debounced auto-publish after local diary/issue writes. Fire-and-forget.
 *
 * Skipped on a hybrid device: the farm's records are keyed by its cloud id and
 * the mirror by its mist id, and `Plans/FREENET_NETWORK_PACK.md` §3.4 keeps a
 * hybrid mirror to explicit **Send** in Phase 1 — no per-save mirroring.
 */
export function scheduleMistHotAutoPublish(farmId: string, farmName?: string): void {
  if (!isMistHotMirrorAvailable()) return;
  if (mistSessionCloudFarmId()) return;

  const existing = autoPublishTimers.get(farmId);
  if (existing) clearTimeout(existing);

  autoPublishTimers.set(
    farmId,
    setTimeout(() => {
      autoPublishTimers.delete(farmId);
      void publishLocalFarmToMistHot(farmId, { farmName, auto: true }).catch((err) => {
        console.warn('[mistHotBridge] auto-publish failed:', err);
      });
    }, AUTO_PUBLISH_DEBOUNCE_MS),
  );
}

export { getMistHotPublishStatus, type MistHotPublishStatus };
