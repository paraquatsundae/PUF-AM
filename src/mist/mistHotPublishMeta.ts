/**
 * Last mist Hot publish status (local-only metadata for workshop UI).
 */

export type MistHotPublishStatus = {
  farmId: string;
  publishedAt: string;
  contentHash: string;
  recordCount: number;
  diaryCount: number;
  issueCount: number;
  issueArchiveCount: number;
  encrypted: boolean;
  storageKey: string;
};

const META_PREFIX = 'pufam.mist.hotPublish.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function metaKey(farmId: string): string {
  return `${META_PREFIX}.${farmId}`;
}

export function getMistHotPublishStatus(farmId: string): MistHotPublishStatus | null {
  const raw = storage()?.getItem(metaKey(farmId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MistHotPublishStatus;
  } catch {
    return null;
  }
}

export function saveMistHotPublishStatus(status: MistHotPublishStatus): void {
  storage()?.setItem(metaKey(status.farmId), JSON.stringify(status));
}

export function clearMistHotPublishStatus(farmId: string): void {
  storage()?.removeItem(metaKey(farmId));
}
