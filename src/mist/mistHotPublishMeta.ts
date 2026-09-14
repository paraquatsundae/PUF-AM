/**
 * Last mist Hot publish status (local-only metadata for workshop UI).
 */

import type { JoinRole } from '../../shared/sync/joinTicket.ts';
import type { JoinPresetId } from '../../shared/sync/joinGrant.ts';

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
  /** Preset that ticket was minted against, so the card can name it after a reload. */
  joinTicketPreset?: JoinPresetId;
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

/**
 * Local Hot pack must not wipe the last Freenet URI/hash pair.
 * Watch pings require that pair; a new local hash with the old URI makes
 * other terminals GET stale bytes and fail the hash check
 * (`Plans/SETTINGS_SYNC_AND_CREW.md` §9 Decision 2026-09-13).
 */
export function mergeLocalHotPackStatus(
  farmId: string,
  pack: Pick<
    MistHotPublishStatus,
    | 'publishedAt'
    | 'contentHash'
    | 'recordCount'
    | 'diaryCount'
    | 'issueCount'
    | 'issueArchiveCount'
    | 'encrypted'
    | 'storageKey'
  >,
): void {
  const existing = getMistHotPublishStatus(farmId);
  const keepPublished = Boolean(existing?.freenetUri);
  saveMistHotPublishStatus({
    farmId,
    publishedAt: pack.publishedAt,
    contentHash: keepPublished && existing?.contentHash ? existing.contentHash : pack.contentHash,
    recordCount: pack.recordCount,
    diaryCount: pack.diaryCount,
    issueCount: pack.issueCount,
    issueArchiveCount: pack.issueArchiveCount,
    encrypted: pack.encrypted,
    storageKey: pack.storageKey,
    ...(existing?.freenetUri
      ? {
          freenetUri: existing.freenetUri,
          freenetPublishedAt: existing.freenetPublishedAt,
          freenetPending: existing.freenetPending,
        }
      : {}),
    ...(existing?.bonesFreenetUri
      ? {
          bonesFreenetUri: existing.bonesFreenetUri,
          bonesFreenetPublishedAt: existing.bonesFreenetPublishedAt,
          bonesFreenetPending: existing.bonesFreenetPending,
          bonesContentHash: existing.bonesContentHash,
        }
      : {}),
    ...(existing?.joinTicket
      ? {
          joinTicket: existing.joinTicket,
          joinTicketRole: existing.joinTicketRole,
          joinTicketPreset: existing.joinTicketPreset,
          joinTicketExpires: existing.joinTicketExpires,
          joinTicketMintedAt: existing.joinTicketMintedAt,
        }
      : {}),
  });
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
  patch: { ticket: string; role: JoinRole; preset?: JoinPresetId; expires?: string },
): void {
  const existing = getMistHotPublishStatus(farmId);
  if (!existing) return;
  saveMistHotPublishStatus({
    ...existing,
    joinTicket: patch.ticket,
    joinTicketRole: patch.role,
    ...(patch.preset ? { joinTicketPreset: patch.preset } : {}),
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
  const existing = getMistBonesPublishStatus(status.farmId);
  const publishedPair =
    status.freenetUri && status.contentHash
      ? { freenetUri: status.freenetUri, contentHash: status.contentHash }
      : existing?.freenetUri && existing.contentHash
        ? { freenetUri: existing.freenetUri, contentHash: existing.contentHash }
        : {
            ...(status.freenetUri ?? existing?.freenetUri
              ? { freenetUri: status.freenetUri ?? existing?.freenetUri }
              : {}),
            contentHash: status.contentHash,
          };
  const merged: MistBonesPublishStatus = {
    ...existing,
    ...status,
    ...publishedPair,
    freenetPublishedAt: status.freenetPublishedAt ?? existing?.freenetPublishedAt,
    freenetPending: status.freenetPending ?? existing?.freenetPending,
  };
  storage()?.setItem(bonesMetaKey(status.farmId), JSON.stringify(merged));

  const hot = getMistHotPublishStatus(merged.farmId);
  if (hot && merged.freenetUri && merged.contentHash) {
    saveMistHotPublishStatus({
      ...hot,
      bonesFreenetUri: merged.freenetUri,
      bonesFreenetPublishedAt: merged.freenetPublishedAt ?? hot.bonesFreenetPublishedAt,
      bonesFreenetPending: merged.freenetPending ?? hot.bonesFreenetPending,
      bonesContentHash: merged.contentHash,
    });
  }
}

/** Last Freenet Bones URI+hash that may ride a watch ping — never mix a new local hash with an old URI. */
export function bonesWatchPairFromStatus(
  farmId: string,
): { bonesUri: string; bonesContentHash: string } | null {
  const bones = getMistBonesPublishStatus(farmId);
  if (bones?.freenetUri && bones.contentHash) {
    return { bonesUri: bones.freenetUri, bonesContentHash: bones.contentHash };
  }
  const hot = getMistHotPublishStatus(farmId);
  if (hot?.bonesFreenetUri && hot.bonesContentHash) {
    return { bonesUri: hot.bonesFreenetUri, bonesContentHash: hot.bonesContentHash };
  }
  return null;
}

const BONES_PENDING_PREFIX = 'pufam.mist.bonesPending.v1';

function pendingKey(farmId: string): string {
  return `${BONES_PENDING_PREFIX}.${farmId}`;
}

/** Local paddock/pin/track save that still needs a Freenet Bones PUT + watch bump. */
export function markBonesPublishPending(farmId: string): void {
  storage()?.setItem(pendingKey(farmId), new Date().toISOString());
}

export function clearBonesPublishPending(farmId: string): void {
  storage()?.removeItem(pendingKey(farmId));
}

export function isBonesPublishPending(farmId: string): boolean {
  return Boolean(storage()?.getItem(pendingKey(farmId)));
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
