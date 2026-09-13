/**
 * Cheap Freenet Hot watch: ping generation/hash, fetch Hot only when it changed.
 *
 * Apply merges map highlights (and LWW diary/issues). Does not need FarmSeed —
 * crew HotKey decrypts. Does not remint a join ticket.
 *
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §9 Decision 2026-09-12
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
import { hotStateToFarmEntities, type HotFarmEntities } from './hotAdapter.ts';
import { publishHotWatchSlot, readHotWatchSlot } from './hotWatchSlot.ts';
import { getMistHotPublishStatus, saveFreenetHotUri } from './mistHotPublishMeta.ts';
import { pullHotFromFreenetByUri } from './mistFreenetClient.ts';
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
    replaceLocalEntities(farmId, 'issues', mergeByUpdatedAt(localIssues, entities.issues)),
    replaceLocalEntities(
      farmId,
      'issues_archive',
      mergeByUpdatedAt(localArchive, entities.issuesArchive),
    ),
  ]);
  notifyMapHighlightsChanged(farmId);
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
}

export async function applyHotWatchPing(
  farmId: string,
  ping: HotWatchPing,
): Promise<HotWatchPollResult> {
  const local = readHotWatchCursor(farmId);
  if (!hotWatchPingChanged(local, ping)) return 'unchanged';

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
  writeHotWatchCursor(farmId, {
    generation: ping.generation,
    hotContentHash: ping.hotContentHash,
    hotUri: ping.hotUri,
    appliedAt: new Date().toISOString(),
  });
  return 'applied';
}

/** After a Hot PUT: bump the watch slot so other terminals see a cheap yes. */
export async function publishHotWatchAfterHotPut(farmId: string): Promise<HotWatchPing | null> {
  if (mistSessionCloudFarmId()) return null;
  const keys = await resolveMistReadKeys();
  if (!keys) return null;
  const status = getMistHotPublishStatus(farmId);
  if (!status?.freenetUri || !status.contentHash) return null;

  const generation = nextHotWatchGeneration(farmId);
  const ping: HotWatchPing = {
    v: 1,
    kind: 'hot-watch',
    farmId,
    generation,
    hotUri: status.freenetUri,
    hotContentHash: status.contentHash,
    updatedAt: new Date().toISOString(),
  };
  await publishHotWatchSlot(ping, keys.hotKey);
  writeHotWatchCursor(farmId, {
    generation,
    hotContentHash: ping.hotContentHash,
    hotUri: ping.hotUri,
    appliedAt: ping.updatedAt,
  });
  return ping;
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
