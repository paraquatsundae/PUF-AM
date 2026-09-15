/**
 * Bridge: production local data (pufom_farm_local) → mist Hot contract.
 *
 * Parallel to Firestore/outbox — does not mutate cloud paths.
 * Active when a mist device session is unlocked (FarmSeed or crew Hot/Bones).
 */

import {
  decryptHotBlob,
  decryptHotBlobWithKey,
  deriveBonesContractKey,
  deriveHotContractKey,
  encryptHotBlobWithKey,
  hotKey,
  sha256Hex,
  type HotState,
  type MistStore,
} from '../../units/mist-freenet/src/index.ts';
import { hasSubtleCrypto } from '../../units/mist-freenet/src/subtle-crypto.ts';
import { buildFarmExportJson } from '../lib/farmExport';
import { activeMapHighlights, listLocalHighlights } from '../lib/mapHighlights';
import { buildHotStateFromFarmExport } from './hotAdapter.ts';
import { farmChatHotBridge } from './hotFarmChatBridge.ts';
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
  rememberUnlockedReadKeys,
  sessionHasFarmSeed,
  unlockedReadKeys,
  type MistReadKeys,
} from './mistReadKeys.ts';
import { isFreenetHostHoldOff } from '../lib/freenetHostHoldOff.ts';
import { freenetFarmPublishInFlight } from './freenetPublishLock.ts';
import {
  getMistHotPublishStatus,
  isHotPublishPending,
  markHotPublishPending,
  mergeLocalHotPackStatus,
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
  if (!session || !sessionHasFarmSeed(session) || !session.farmSeedHex) return null;
  return hexToBytes(session.farmSeedHex);
}

/** Hot/Bones keys from FarmSeed (owner) or a crew invite. Never invents a FarmSeed. */
export async function resolveMistReadKeys(devicePin?: string): Promise<MistReadKeys | null> {
  const cached = unlockedReadKeys();
  if (cached) return cached;

  const farmSeed = await resolveMistFarmSeed(devicePin);
  if (farmSeed) {
    const keys: MistReadKeys = {
      farmSeed,
      hotKey: await deriveHotContractKey(farmSeed),
      bonesKey: await deriveBonesContractKey(farmSeed),
    };
    rememberUnlockedReadKeys(keys);
    return keys;
  }

  const session = await loadMistDeviceSession(devicePin);
  if (!session?.hotKeyHex || !session.bonesKeyHex) return null;
  const keys: MistReadKeys = {
    hotKey: hexToBytes(session.hotKeyHex),
    bonesKey: hexToBytes(session.bonesKeyHex),
  };
  rememberUnlockedReadKeys(keys);
  return keys;
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
  keys: MistReadKeys,
): Promise<HotState | null> {
  const key = hotKey(farmId, 'current');
  const entry = await store.get(key);
  if (!entry) return null;
  const plain = keys.farmSeed
    ? await decryptHotBlob(entry.ciphertext, keys.farmSeed)
    : await decryptHotBlobWithKey(entry.ciphertext, keys.hotKey);
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

  const readKeys = await resolveMistReadKeys(opts?.devicePin);
  if (!readKeys) {
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

  const previous = await readExistingHotState(store, farmId, readKeys);
  const mapHighlights = activeMapHighlights(
    await listLocalHighlights(cloudFarmId || farmId),
  );
  // Hybrid: Firestore is authority — do not dual-write chat onto the mirror.
  const chatBridge = !cloudFarmId ? farmChatHotBridge() : null;
  const farmChatPayload = chatBridge?.payload?.(farmId);
  const farmChat = farmChatPayload?.messages ?? chatBridge?.list(farmId) ?? [];
  const farmChatExtra = farmChatPayload
    ? {
        ...(farmChatPayload.dayDate ? { dayDate: farmChatPayload.dayDate } : {}),
        ...(farmChatPayload.dayMessages?.length
          ? { dayMessages: farmChatPayload.dayMessages }
          : {}),
        ...(farmChatPayload.archives?.length ? { archives: farmChatPayload.archives } : {}),
      }
    : undefined;
  const hotState = buildHotStateFromFarmExport(exportBundle, {
    previous,
    defaultAuthor: exportBundle.farmName,
    farmId,
    mapHighlights,
    farmChat,
    ...(farmChatExtra && Object.keys(farmChatExtra).length ? { farmChatExtra } : {}),
    ...(cloudFarmId ? { cloudFarmId } : {}),
  });

  const plainBytes = new TextEncoder().encode(JSON.stringify(hotState));
  const canEncrypt = hasSubtleCrypto();
  const storedBytes = canEncrypt
    ? await encryptHotBlobWithKey(plainBytes, readKeys.hotKey)
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

  mergeLocalHotPackStatus(farmId, result);

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

  const keys = await resolveMistReadKeys(devicePin);
  if (!keys) {
    throw farmSeedLockedError('read Hot', devicePin);
  }

  const storageKey = hotKey(farmId, 'current');
  const entry = await store.get(storageKey);
  if (!entry) return null;

  const plain = keys.farmSeed
    ? await decryptHotBlob(entry.ciphertext, keys.farmSeed)
    : await decryptHotBlobWithKey(entry.ciphertext, keys.hotKey);
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
 * Debounced auto-publish after local diary/issue/highlight writes.
 *
 * Writes local `hot/current`, then PUTs that blob to Freenet and bumps the
 * Hot-watch slot so other terminals can ping cheaply
 * (`Plans/SETTINGS_SYNC_AND_CREW.md` §9 Decision 2026-09-12).
 *
 * Skipped on a hybrid device: `Plans/FREENET_NETWORK_PACK.md` §3.4 keeps a
 * hybrid mirror to explicit **Send** in Phase 1.
 */
export function scheduleMistHotAutoPublish(farmId: string, farmName?: string): void {
  if (mistSessionCloudFarmId()) return;
  markHotPublishPending(farmId);
  if (!isMistHotMirrorAvailable()) return;

  const existing = autoPublishTimers.get(farmId);
  if (existing) clearTimeout(existing);

  autoPublishTimers.set(
    farmId,
    setTimeout(() => {
      autoPublishTimers.delete(farmId);
      void flushPendingHotAutoPublish(farmId, farmName);
    }, AUTO_PUBLISH_DEBOUNCE_MS),
  );
}

/**
 * PUT Hot + bump watch when a diary / highlight / farm-chat save is still pending.
 * Keeps the pending flag if keys are locked, Opennet is down, or Send is in flight.
 */
export async function flushPendingHotAutoPublish(
  farmId: string,
  farmName?: string,
): Promise<boolean> {
  if (!farmId || mistSessionCloudFarmId()) return false;
  if (!isHotPublishPending(farmId)) return false;
  if (!isMistHotMirrorAvailable()) return false;
  if (isFreenetHostHoldOff()) return false;
  if (freenetFarmPublishInFlight()) return false;

  try {
    const packed = await publishLocalFarmToMistHot(farmId, { farmName, auto: true });
    if (!packed) return false;
    const { publishHotToFreenet } = await import('./mistFreenetClient.ts');
    await publishHotToFreenet(farmId);
    if (!isHotPublishPending(farmId)) return true;
    return false;
  } catch (err) {
    console.warn('[mistHotBridge] auto-publish failed:', err);
    return false;
  }
}

export { getMistHotPublishStatus, type MistHotPublishStatus };
