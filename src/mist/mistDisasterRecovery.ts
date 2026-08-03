/**
 * Workshop disaster-recovery smoke — wipe local farm data, recover from mist Hot.
 *
 * FarmCode / device session (FarmSeed) are preserved so Hot ciphertext can still decrypt.
 */

import { bonesKey, hotKey, type HotState, type MistStore } from '../../units/mist-freenet/src/index.ts';
import type { LocalFarmEntityCounts } from '../lib/localFarmRepo';
import {
  countLocalFarmEntities,
  replaceLocalEntities,
  wipeLocalFarmEntitiesForFarm,
} from '../lib/localFarmRepo';
import { BONES_WORKSHOP_ASSET_ID } from './bonesWorkshop.ts';
import { countHotFarmEntities, hotStateToFarmEntities } from './hotAdapter.ts';
import { getMistStoreForHotBridge, readMistHotCurrent } from './mistHotBridge.ts';
import { clearMistHotPublishStatus } from './mistHotPublishMeta.ts';
import { pullHotFromFreenet } from './mistFreenetClient.ts';

export type { LocalFarmEntityCounts };

export type WipeLocalFarmOpts = {
  /** Clear encrypted hot/current in pufam-mist-v1 (default true). */
  clearHot?: boolean;
  /** Clear bones workshop-smoke blob (default false). */
  clearBonesWorkshop?: boolean;
  /** Clear last-publish metadata in localStorage (default true). */
  clearHotPublishMeta?: boolean;
};

export type WipeLocalFarmResult = {
  before: LocalFarmEntityCounts;
  after: LocalFarmEntityCounts;
  clearedHot: boolean;
  clearedBonesWorkshop: boolean;
};

export type RehydrateLocalFarmResult = {
  before: LocalFarmEntityCounts;
  after: LocalFarmEntityCounts;
  hot: {
    records: number;
    diary: number;
    issues: number;
    issuesArchive: number;
  };
};

export type RecoverFromHotResult = RehydrateLocalFarmResult & {
  contentHash: string;
  source: 'local-hot' | 'freenet-hot';
};

async function deleteMistStoreKey(store: MistStore, key: string): Promise<boolean> {
  const deletable = store as MistStore & { deleteKey?: (k: string) => Promise<boolean> };
  if (typeof deletable.deleteKey !== 'function') {
    throw new Error('Mist store backend does not support deleteKey');
  }
  return deletable.deleteKey(key);
}

/** Count diary/issues in pufom_farm_local for workshop status lines. */
export async function getLocalFarmEntityCounts(farmId: string): Promise<LocalFarmEntityCounts> {
  return countLocalFarmEntities(farmId);
}

/**
 * Simulate local data loss — wipes pufom_farm_local entities + optional mist Hot blob.
 * Does NOT touch FarmCode, device session, or farm geometry.
 */
export async function wipeLocalFarmForDisasterRecovery(
  farmId: string,
  opts?: WipeLocalFarmOpts,
): Promise<WipeLocalFarmResult> {
  const clearHot = opts?.clearHot !== false;
  const clearBonesWorkshop = opts?.clearBonesWorkshop === true;
  const clearHotPublishMeta = opts?.clearHotPublishMeta !== false;

  const before = await wipeLocalFarmEntitiesForFarm(farmId);

  let clearedHot = false;
  let clearedBonesWorkshop = false;

  const store = await getMistStoreForHotBridge();
  if (store) {
    if (clearHot) {
      clearedHot = await deleteMistStoreKey(store, hotKey(farmId, 'current'));
    }
    if (clearBonesWorkshop) {
      clearedBonesWorkshop = await deleteMistStoreKey(store, bonesKey(farmId, BONES_WORKSHOP_ASSET_ID));
    }
  }

  if (clearHotPublishMeta) {
    clearMistHotPublishStatus(farmId);
  }

  const after = await countLocalFarmEntities(farmId);
  return { before, after, clearedHot, clearedBonesWorkshop };
}

/** Write HotState records back into pufom_farm_local (full replace per kind). */
export async function rehydrateLocalFarmFromHot(
  farmId: string,
  hot: HotState,
): Promise<RehydrateLocalFarmResult> {
  if (hot.farm_id !== farmId) {
    throw new Error(`Hot farm_id mismatch: expected ${farmId}, got ${hot.farm_id}`);
  }

  const before = await countLocalFarmEntities(farmId);
  const entities = hotStateToFarmEntities(hot);

  await Promise.all([
    replaceLocalEntities(farmId, 'diary', entities.diary),
    replaceLocalEntities(farmId, 'issues', entities.issues),
    replaceLocalEntities(farmId, 'issues_archive', entities.issuesArchive),
  ]);

  const after = await countLocalFarmEntities(farmId);
  const hotCounts = countHotFarmEntities(hot);

  return {
    before,
    after,
    hot: {
      records: hotCounts.records,
      diary: hotCounts.diary,
      issues: hotCounts.issues,
      issuesArchive: hotCounts.issuesArchive,
    },
  };
}

/** Decrypt local hot/current and rehydrate pufom_farm_local. */
export async function recoverLocalFarmFromMistHot(
  farmId: string,
  devicePin?: string,
): Promise<RecoverFromHotResult> {
  const readBack = await readMistHotCurrent(farmId, devicePin);
  if (!readBack) {
    throw new Error('No local hot/current — pull from Freenet or publish Hot first');
  }

  const result = await rehydrateLocalFarmFromHot(farmId, readBack.hot);
  return {
    ...result,
    contentHash: readBack.contentHash,
    source: 'local-hot',
  };
}

/** Pull hot/current from Freenet → local IndexedDB → decrypt → rehydrate. */
export async function recoverLocalFarmFromFreenet(
  farmId: string,
  devicePin?: string,
): Promise<RecoverFromHotResult> {
  const pull = await pullHotFromFreenet(farmId);
  const readBack = await readMistHotCurrent(farmId, devicePin);
  if (!readBack) {
    throw new Error('Pulled Hot ciphertext but decrypt failed — unlock mist device session');
  }

  const result = await rehydrateLocalFarmFromHot(farmId, readBack.hot);
  return {
    ...result,
    contentHash: pull.contentHash,
    source: 'freenet-hot',
  };
}

/** Refresh in-memory zustand stores after rehydrate (best-effort). */
export async function refreshFarmUiAfterRecovery(farmId: string): Promise<void> {
  const [{ useFieldStore }, { forceReloadFarmDiary }] = await Promise.all([
    import('../lib/fieldStore'),
    import('../lib/farmDiary'),
  ]);

  useFieldStore.setState({ isLoaded: false, isArchiveLoaded: false });
  useFieldStore.getState().loadData(farmId);
  useFieldStore.getState().loadArchive(farmId);
  forceReloadFarmDiary(farmId);
}

export function formatEntityCounts(counts: LocalFarmEntityCounts): string {
  return `${counts.diary} diary · ${counts.issues} issues · ${counts.issuesArchive} archived · ${counts.outbox} outbox`;
}

export function formatWipeResult(result: WipeLocalFarmResult): string {
  return (
    `Local wipe — before: ${formatEntityCounts(result.before)} → after: ${formatEntityCounts(result.after)}` +
    `${result.clearedHot ? ' · hot/current cleared' : ''}` +
    `${result.clearedBonesWorkshop ? ' · bones workshop cleared' : ''}`
  );
}

export function formatRehydrateResult(result: RehydrateLocalFarmResult): string {
  return (
    `Rehydrated from Hot — before: ${formatEntityCounts(result.before)} → after: ${formatEntityCounts(result.after)}` +
    ` (Hot: ${result.hot.diary}+${result.hot.issues}+${result.hot.issuesArchive} entities, ${result.hot.records} records)`
  );
}
