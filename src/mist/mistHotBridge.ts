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

  const exportBundle = await buildFarmExportJson(farmId, {
    farmName: opts?.farmName,
    source: 'mist',
    includeIssues: true,
    includeIssuesArchive: true,
  });

  const previous = await readExistingHotState(store, farmId, farmSeed);
  const hotState = buildHotStateFromFarmExport(exportBundle, {
    previous,
    defaultAuthor: exportBundle.farmName,
  });

  const plainBytes = new TextEncoder().encode(JSON.stringify(hotState));
  const canEncrypt = hasSubtleCrypto();
  const storedBytes = canEncrypt
    ? await encryptHotBlob(plainBytes, farmSeed)
    : plainBytes;

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
  };

  saveMistHotPublishStatus({
    farmId,
    ...result,
  });

  return result;
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

/** Debounced auto-publish after local diary/issue writes. Fire-and-forget. */
export function scheduleMistHotAutoPublish(farmId: string, farmName?: string): void {
  if (!isMistHotMirrorAvailable()) return;

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
