/**
 * Last mist Hot publish status (local-only metadata for workshop UI).
 */

import type { JoinRole } from '../../shared/sync/joinTicket.ts';

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
  /** Last FN02@ URI after Publish Hot to Freenet (laptop A → handoff to B). */
  freenetUri?: string;
  freenetPublishedAt?: string;
  freenetPending?: boolean;
  /** Farm geometry bones Freenet URI (workshop handoff). */
  bonesFreenetUri?: string;
  bonesFreenetPublishedAt?: string;
  bonesFreenetPending?: boolean;
  bonesContentHash?: string;
  /** Last short join ticket minted for this farm (`PUF-XXXX-XXXX`). */
  joinTicket?: string;
  joinTicketRole?: JoinRole;
  joinTicketExpires?: string;
  joinTicketMintedAt?: string;
};

export type MistBonesPublishStatus = {
  farmId: string;
  publishedAt: string;
  contentHash: string;
  blockCount: number;
  pinCount: number;
  trackCount: number;
  hasViewport: boolean;
  encrypted: boolean;
  storageKey: string;
  freenetUri?: string;
  freenetPublishedAt?: string;
  freenetPending?: boolean;
};

const META_PREFIX = 'pufam.mist.hotPublish.v1';
const BONES_META_PREFIX = 'pufam.mist.bonesPublish.v1';

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

/** Merge Freenet publish metadata into existing Hot publish status (workshop handoff). */
export function saveFreenetHotUri(
  farmId: string,
  patch: {
    freenetUri: string;
    contentHash: string;
    freenetPending?: boolean;
    storageKey?: string;
  },
): void {
  const existing = getMistHotPublishStatus(farmId);
  const next: MistHotPublishStatus = {
    ...existing,
    farmId,
    publishedAt: existing?.publishedAt ?? new Date().toISOString(),
    contentHash: patch.contentHash,
    recordCount: existing?.recordCount ?? 0,
    diaryCount: existing?.diaryCount ?? 0,
    issueCount: existing?.issueCount ?? 0,
    issueArchiveCount: existing?.issueArchiveCount ?? 0,
    encrypted: existing?.encrypted ?? true,
    storageKey: patch.storageKey ?? existing?.storageKey ?? '',
    freenetUri: patch.freenetUri,
    freenetPublishedAt: new Date().toISOString(),
    freenetPending: patch.freenetPending,
  };
  saveMistHotPublishStatus(next);
}

/** Remember the short ticket so the send card can show it again after a reload. */
export function saveJoinTicketForFarm(
  farmId: string,
  patch: { ticket: string; role: JoinRole; expires?: string },
): void {
  const existing = getMistHotPublishStatus(farmId);
  if (!existing) return;
  saveMistHotPublishStatus({
    ...existing,
    joinTicket: patch.ticket,
    joinTicketRole: patch.role,
    joinTicketExpires: patch.expires,
    joinTicketMintedAt: new Date().toISOString(),
  });
}

function bonesMetaKey(farmId: string): string {
  return `${BONES_META_PREFIX}.${farmId}`;
}

export function getMistBonesPublishStatus(farmId: string): MistBonesPublishStatus | null {
  const raw = storage()?.getItem(bonesMetaKey(farmId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MistBonesPublishStatus;
  } catch {
    return null;
  }
}

export function saveMistBonesPublishStatus(status: MistBonesPublishStatus): void {
  storage()?.setItem(bonesMetaKey(status.farmId), JSON.stringify(status));

  const hot = getMistHotPublishStatus(status.farmId);
  if (hot) {
    saveMistHotPublishStatus({
      ...hot,
      bonesFreenetUri: status.freenetUri ?? hot.bonesFreenetUri,
      bonesFreenetPublishedAt: status.freenetPublishedAt ?? hot.bonesFreenetPublishedAt,
      bonesFreenetPending: status.freenetPending ?? hot.bonesFreenetPending,
      bonesContentHash: status.contentHash,
    });
  }
}

export function saveFreenetBonesUri(
  farmId: string,
  patch: {
    freenetUri: string;
    contentHash: string;
    freenetPending?: boolean;
    storageKey?: string;
  },
): void {
  const existing = getMistBonesPublishStatus(farmId);
  const next: MistBonesPublishStatus = {
    farmId,
    publishedAt: existing?.publishedAt ?? new Date().toISOString(),
    contentHash: patch.contentHash,
    blockCount: existing?.blockCount ?? 0,
    pinCount: existing?.pinCount ?? 0,
    trackCount: existing?.trackCount ?? 0,
    hasViewport: existing?.hasViewport ?? false,
    encrypted: existing?.encrypted ?? true,
    storageKey: patch.storageKey ?? existing?.storageKey ?? '',
    freenetUri: patch.freenetUri,
    freenetPublishedAt: new Date().toISOString(),
    freenetPending: patch.freenetPending,
  };
  saveMistBonesPublishStatus(next);
}
