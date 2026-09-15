/**
 * Cheap Freenet Hot/Bones watch: ping generation + hashes, fetch only what changed.
 *
 * Apply merges map highlights (and LWW diary/issues) and Bones geometry
 * (union by id + updatedAt). Does not need FarmSeed — crew HotKey/BonesKey
 * decrypt. Does not remint a join ticket.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9 Decision 2026-09-12 · 2026-09-13
 */

import { hotWatchPingChanged, type HotWatchPing } from '../../units/mist-freenet/src/hot-watch.ts';
import type { DiaryEvent } from '../lib/farmDiary';
import type { FieldIssue } from '../lib/fieldStore';
import {
  listLocalEntities,
  replaceLocalEntities,
} from '../lib/localFarmRepo';
import {
  listLocalHighlights,
  mergeHighlightsById,
  notifyMapHighlightsChanged,
  replaceLocalHighlights,
} from '../lib/mapHighlights';
import { mergeIssuesKeepingPhotos } from '../lib/issuePhotoMeta';
import { applyIncomingMapLayer } from '../lib/mapLayerPreference';
import { hotStateToFarmEntities, type HotFarmEntities } from './hotAdapter.ts';
import { farmChatHotBridge } from './hotFarmChatBridge.ts';
import { publishHotWatchSlot, readHotWatchSlot } from './hotWatchSlot.ts';
import { getMistPhotoIndexStatus } from './mistPhotoBridge.ts';
import { getFarmGeometry } from '../lib/farmGeometryIdb';
import { mergeFarmGeometryFromBones } from './bonesGeometry.ts';
import { readMistBonesFarmGeometry } from './mistBonesBridge.ts';
import {
  bonesWatchPairFromStatus,
  getMistBonesPublishStatus,
  getMistHotPublishStatus,
  hotWatchPairFromStatus,
  saveFreenetBonesUri,
  saveFreenetHotUri,
} from './mistHotPublishMeta.ts';
import { pullBonesFromFreenetByUri, pullHotFromFreenetByUri } from './mistFreenetClient.ts';
import {
  readMistHotCurrent,
  resolveMistReadKeys,
} from './mistHotBridge.ts';
import { mistSessionCloudFarmId } from './mistDeviceSession.ts';

export const FREENET_HOT_WATCH_POLL_MS = 20_000;
export const FREENET_HOT_WATCH_MIN_GAP_MS = 8_000;

const CURSOR_PREFIX = 'pufam.mist.hotWatch.v1';

export type HotWatchCursor = {
  generation: number;
  hotContentHash: string;
  hotUri?: string;
  bonesContentHash?: string;
  bonesUri?: string;
  photoIndexHash?: string;
  photoIndexUri?: string;
  farmChatHash?: string;
  appliedAt?: string;
};

export type HotWatchPollResult = 'unchanged' | 'applied' | 'skipped';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function cursorKey(farmId: string): string {
  return `${CURSOR_PREFIX}.${farmId}`;
}

export function readHotWatchCursor(farmId: string): HotWatchCursor | null {
  const raw = storage()?.getItem(cursorKey(farmId));
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as HotWatchCursor;
    if (typeof row.generation !== 'number' || typeof row.hotContentHash !== 'string') return null;
    if (row.bonesContentHash && typeof row.bonesContentHash !== 'string') return null;
    if (row.photoIndexHash && typeof row.photoIndexHash !== 'string') return null;
    if (row.farmChatHash && typeof row.farmChatHash !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export function writeHotWatchCursor(farmId: string, cursor: HotWatchCursor): void {
  storage()?.setItem(cursorKey(farmId), JSON.stringify(cursor));
}

/** Publisher-side generation: one higher than the last ping this device wrote. */
export function nextHotWatchGeneration(farmId: string, now = Date.now()): number {
  const prev = readHotWatchCursor(farmId);
  return Math.max((prev?.generation ?? 0) + 1, now);
}

function entityStamp(row: { updatedAt?: string; createdAt?: string; reportedAt?: string }): number {
  return Date.parse(row.updatedAt || row.createdAt || row.reportedAt || '') || 0;
}

export function mergeByUpdatedAt<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  incoming: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const row of local) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of incoming) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    if (!prev || entityStamp(row) >= entityStamp(prev)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/** Merge Hot entities into local stores — highlights + LWW diary/issues, no wholesale wipe. */
export async function mergeHotEntitiesIntoLocal(
  farmId: string,
  entities: HotFarmEntities,
): Promise<{ highlights: number; diary: number; issues: number }> {
  const [localHighlights, localDiary, localIssues, localArchive] = await Promise.all([
    listLocalHighlights(farmId),
    listLocalEntities<DiaryEvent>(farmId, 'diary'),
    listLocalEntities<FieldIssue>(farmId, 'issues'),
    listLocalEntities<FieldIssue>(farmId, 'issues_archive'),
  ]);

  const highlights = mergeHighlightsById(localHighlights, entities.highlights);
  await Promise.all([
    replaceLocalHighlights(farmId, highlights),
    replaceLocalEntities(farmId, 'diary', mergeByUpdatedAt(localDiary, entities.diary)),
    replaceLocalEntities(
      farmId,
      'issues',
      mergeIssuesKeepingPhotos(localIssues, mergeByUpdatedAt(localIssues, entities.issues)),
    ),
    replaceLocalEntities(
      farmId,
      'issues_archive',
      mergeIssuesKeepingPhotos(localArchive, mergeByUpdatedAt(localArchive, entities.issuesArchive)),
    ),
  ]);
  notifyMapHighlightsChanged(farmId);
  if (entities.chatPayload) {
    farmChatHotBridge()?.merge(farmId, entities.chatPayload);
  } else if (entities.chat) {
    farmChatHotBridge()?.merge(farmId, entities.chat);
  }
  return {
    highlights: entities.highlights.length,
    diary: entities.diary.length,
    issues: entities.issues.length,
  };
}

/**
 * Push merged Hot rows into live zustand stores without remounting the map.
 * Must not flip map `isLoaded` or diary `isLoading` — that unmounts Leaflet.
 */
export async function refreshFarmUiAfterHotMerge(farmId: string): Promise<void> {
  const [{ useFarmDiaryStore }, { useFieldStore }] = await Promise.all([
    import('../lib/farmDiaryStore'),
    import('../lib/fieldStore'),
  ]);

  const [diary, issues, archive] = await Promise.all([
    listLocalEntities<DiaryEvent>(farmId, 'diary'),
    listLocalEntities<FieldIssue>(farmId, 'issues'),
    listLocalEntities<FieldIssue>(farmId, 'issues_archive'),
  ]);

  useFarmDiaryStore.getState().mergeIncoming(farmId, diary);
  useFieldStore.getState().mergeIncoming(farmId, issues, archive);
  notifyMapHighlightsChanged(farmId);
  farmChatHotBridge()?.notify(farmId);
  await refreshFarmUiAfterBonesMerge(farmId);
}

/**
 * Apply IDB geometry into the live map store without flipping `isLoaded`
 * or replacing viewport (`Plans/SETTINGS_SYNC_AND_CREW.md` §9).
 */
export async function refreshFarmUiAfterBonesMerge(farmId: string): Promise<void> {
  const { useMapStoreInternal } = await import('../lib/mapStore');
  const state = useMapStoreInternal.getState();
  if (state.currentFarmId && state.currentFarmId !== farmId) return;
  if (!state.isLoaded) return;

  const bundle = await getFarmGeometry(farmId);
  useMapStoreInternal.setState({
    blocks: bundle.blocks,
    pins: bundle.pins,
    tracks: bundle.tracks,
  });
}

function bonesWatchChanged(
  local: HotWatchCursor | null,
  ping: HotWatchPing,
): boolean {
  const hashChanged =
    Boolean(ping.bonesContentHash) && ping.bonesContentHash !== (local?.bonesContentHash ?? '');
  const uriChanged = Boolean(ping.bonesUri && local?.bonesUri && ping.bonesUri !== local.bonesUri);
  return hashChanged || uriChanged;
}

function photoWatchChanged(
  local: HotWatchCursor | null,
  ping: HotWatchPing,
): boolean {
  return Boolean(ping.photoIndexHash) && ping.photoIndexHash !== (local?.photoIndexHash ?? '');
}

function farmChatWatchChanged(
  local: HotWatchCursor | null,
  ping: HotWatchPing,
): boolean {
  return Boolean(ping.farmChatHash) && ping.farmChatHash !== (local?.farmChatHash ?? '');
}

async function applyBonesWatchPing(farmId: string, ping: HotWatchPing): Promise<void> {
  if (!ping.bonesUri || !ping.bonesContentHash) return;
  await pullBonesFromFreenetByUri(farmId, ping.bonesUri, ping.bonesContentHash);
  const readBack = await readMistBonesFarmGeometry(farmId);
  if (!readBack) {
    throw new Error('Pulled Bones but could not decrypt — unlock this farm (Hot/Bones keys).');
  }
  await mergeFarmGeometryFromBones(farmId, readBack.payload);
  applyIncomingMapLayer(farmId, readBack.payload);
  saveFreenetBonesUri(farmId, {
    freenetUri: ping.bonesUri,
    contentHash: ping.bonesContentHash,
  });
}

export async function applyHotWatchPing(
  farmId: string,
  ping: HotWatchPing,
): Promise<HotWatchPollResult> {
  const local = readHotWatchCursor(farmId);
  if (!hotWatchPingChanged(local, ping)) return 'unchanged';

  const hotChanged =
    !local ||
    ping.hotContentHash !== local.hotContentHash ||
    Boolean(ping.hotUri && local.hotUri && ping.hotUri !== local.hotUri) ||
    farmChatWatchChanged(local, ping);
  if (hotChanged) {
    await pullHotFromFreenetByUri(farmId, ping.hotUri, ping.hotContentHash);
    const readBack = await readMistHotCurrent(farmId);
    if (!readBack) {
      throw new Error('Pulled Hot but could not decrypt — unlock this farm (Hot/Bones keys).');
    }
    await mergeHotEntitiesIntoLocal(farmId, hotStateToFarmEntities(readBack.hot));
    saveFreenetHotUri(farmId, {
      freenetUri: ping.hotUri,
      contentHash: ping.hotContentHash,
    });
  }

  if (bonesWatchChanged(local, ping)) {
    await applyBonesWatchPing(farmId, ping);
  }

  if (photoWatchChanged(local, ping) && ping.photoIndexUri && ping.photoIndexHash) {
    const { applyPhotoIndexWatch } = await import('./mistPhotoFreenet.ts');
    await applyPhotoIndexWatch(farmId, ping.photoIndexUri, ping.photoIndexHash);
  }

  writeHotWatchCursor(farmId, {
    generation: ping.generation,
    hotContentHash: ping.hotContentHash,
    hotUri: ping.hotUri,
    bonesContentHash: ping.bonesContentHash,
    bonesUri: ping.bonesUri,
    photoIndexHash: ping.photoIndexHash,
    photoIndexUri: ping.photoIndexUri,
    farmChatHash: ping.farmChatHash,
    appliedAt: new Date().toISOString(),
  });
  return 'applied';
}

function bonesFieldsFromStatus(farmId: string): Pick<HotWatchPing, 'bonesUri' | 'bonesContentHash'> {
  return bonesWatchPairFromStatus(farmId) ?? {};
}

function photoFieldsFromStatus(
  farmId: string,
): Pick<HotWatchPing, 'photoIndexUri' | 'photoIndexHash'> {
  const photos = getMistPhotoIndexStatus(farmId);
  if (!photos?.freenetUri || !photos.contentHash) return {};
  return { photoIndexUri: photos.freenetUri, photoIndexHash: photos.contentHash };
}

function farmChatFieldsFromStatus(
  farmId: string,
  hotUri: string,
): Pick<HotWatchPing, 'farmChatHash'> {
  const pair = hotWatchPairFromStatus(farmId);
  // Never advertise a newer local chat hash with a stale Hot URI.
  if (!pair?.farmChatHash || pair.hotUri !== hotUri) return {};
  return { farmChatHash: pair.farmChatHash };
}

/** After a Hot or Bones PUT: bump the watch slot so other terminals see a cheap yes. */
export async function publishHotWatchAfterHotPut(farmId: string): Promise<HotWatchPing | null> {
  if (mistSessionCloudFarmId()) return null;
  const keys = await resolveMistReadKeys();
  if (!keys) return null;
  const pair = hotWatchPairFromStatus(farmId);
  const cursor = readHotWatchCursor(farmId);
  const hotUri = pair?.hotUri || cursor?.hotUri;
  const hotContentHash = pair?.hotContentHash || cursor?.hotContentHash;
  if (!hotUri || !hotContentHash) return null;

  const generation = nextHotWatchGeneration(farmId);
  const bones = bonesFieldsFromStatus(farmId);
  const photos = photoFieldsFromStatus(farmId);
  const chat = farmChatFieldsFromStatus(farmId, hotUri);
  const ping: HotWatchPing = {
    v: 1,
    kind: 'hot-watch',
    farmId,
    generation,
    hotUri,
    hotContentHash,
    updatedAt: new Date().toISOString(),
    ...bones,
    ...photos,
    ...chat,
  };
  await publishHotWatchSlot(ping, keys.hotKey);
  writeHotWatchCursor(farmId, {
    generation,
    hotContentHash: ping.hotContentHash,
    hotUri: ping.hotUri,
    bonesContentHash: ping.bonesContentHash,
    bonesUri: ping.bonesUri,
    photoIndexHash: ping.photoIndexHash,
    photoIndexUri: ping.photoIndexUri,
    farmChatHash: ping.farmChatHash,
    appliedAt: ping.updatedAt,
  });
  return ping;
}

/** After a Bones PUT: same slot, new bones hash so geometry-only edits ping. */
export async function publishHotWatchAfterBonesPut(farmId: string): Promise<HotWatchPing | null> {
  return publishHotWatchAfterHotPut(farmId);
}

/** After a photo PUT: same slot, new photo-index hash — do not republish Hot. */
export async function publishHotWatchAfterPhotoPut(farmId: string): Promise<HotWatchPing | null> {
  return publishHotWatchAfterHotPut(farmId);
}

/**
 * After a URI pull: merge Hot + Bones into the live stores. Does not remount
 * the map or replace viewport / basemap unless Bones names a newer layer.
 */
export async function applyPulledFreenetMirror(farmId: string): Promise<{
  diary: number;
  issues: number;
  blocks: number;
}> {
  const readBack = await readMistHotCurrent(farmId);
  let diary = 0;
  let issues = 0;
  if (readBack) {
    const merged = await mergeHotEntitiesIntoLocal(farmId, hotStateToFarmEntities(readBack.hot));
    diary = merged.diary;
    issues = merged.issues;
    const hot = getMistHotPublishStatus(farmId);
    if (hot?.freenetUri && hot.contentHash) {
      saveFreenetHotUri(farmId, {
        freenetUri: hot.freenetUri,
        contentHash: hot.contentHash,
        ...(hot.farmChatHash ? { farmChatHash: hot.farmChatHash } : {}),
      });
    }
  }

  const bonesRead = await readMistBonesFarmGeometry(farmId);
  let blocks = 0;
  if (bonesRead) {
    const geometry = await mergeFarmGeometryFromBones(farmId, bonesRead.payload);
    applyIncomingMapLayer(farmId, bonesRead.payload);
    blocks = geometry.after.blocks;
    const bones = getMistBonesPublishStatus(farmId);
    if (bones?.freenetUri && bones.contentHash) {
      saveFreenetBonesUri(farmId, { freenetUri: bones.freenetUri, contentHash: bones.contentHash });
    }
  }

  const status = getMistHotPublishStatus(farmId);
  if (status?.freenetUri && status.contentHash) {
    const prev = readHotWatchCursor(farmId);
    writeHotWatchCursor(farmId, {
      generation: prev?.generation ?? Date.now(),
      hotContentHash: status.contentHash,
      hotUri: status.freenetUri,
      bonesContentHash: status.bonesContentHash || prev?.bonesContentHash,
      bonesUri: status.bonesFreenetUri || prev?.bonesUri,
      photoIndexHash: prev?.photoIndexHash,
      photoIndexUri: prev?.photoIndexUri,
      farmChatHash: status.farmChatHash || prev?.farmChatHash,
      appliedAt: new Date().toISOString(),
    });
  }

  return { diary, issues, blocks };
}

/** Background poll: slot GET, fetch Hot only when generation/hash changed. */
export async function pollFreenetHotWatch(farmId: string): Promise<HotWatchPollResult> {
  if (!farmId || mistSessionCloudFarmId()) return 'skipped';
  const keys = await resolveMistReadKeys();
  if (!keys) return 'skipped';

  let ping: HotWatchPing;
  try {
    ping = await readHotWatchSlot(farmId, keys.hotKey);
  } catch {
    return 'skipped';
  }

  if (!hotWatchPingChanged(readHotWatchCursor(farmId), ping)) return 'unchanged';
  return applyHotWatchPing(farmId, ping);
}
