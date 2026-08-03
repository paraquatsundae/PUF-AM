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
import { hasMistDeviceSession, loadMistDeviceSession } from './mistDeviceSession.ts';
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

let cachedFarmSeed: Uint8Array | null = null;
const autoPublishTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTO_PUBLISH_DEBOUNCE_MS = 2500;

/** True when local diary/issues may be mirrored to mist Hot. */
export function isMistHotMirrorAvailable(): boolean {
  return hasMistDeviceSession();
}

/** Open IndexedDB mist store when a device session exists (independent of FarmStore backend). */
export async function getMistStoreForHotBridge(): Promise<MistStore | null> {
  if (!hasMistDeviceSession()) return null;
  return ensureBrowserMistStore();
}

async function resolveFarmSeed(devicePin?: string): Promise<Uint8Array | null> {
  if (cachedFarmSeed) return cachedFarmSeed;
  const session = await loadMistDeviceSession(devicePin);
  if (!session) return null;
  cachedFarmSeed = hexToBytes(session.farmSeedHex);
  return cachedFarmSeed;
}

/** Clear in-memory FarmSeed (sign-out). */
export function clearCachedFarmSeedForHot(): void {
  cachedFarmSeed = null;
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

  const farmSeed = await resolveFarmSeed(opts?.devicePin);
  if (!farmSeed) {
    if (opts?.auto) return null;
    throw new Error('Mist device session locked — unlock to publish Hot');
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

  const farmSeed = await resolveFarmSeed(devicePin);
  if (!farmSeed) {
    throw new Error('Mist device session locked — unlock to read Hot');
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
