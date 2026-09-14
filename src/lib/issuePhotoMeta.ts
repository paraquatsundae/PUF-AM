/**
 * Issue-photo metadata that rides on the local issue row.
 * Bytes live in `pufam_issue_photos` (Freenet) or Storage (hosted).
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

import { listIssuePhotoRefs, photosForFirestore, type FarmPhotoRef } from './farmPhoto';
import type { FieldIssue } from './fieldStore';

export type IssuePhotoStatus = 'local' | 'uploading' | 'ready' | 'failed';

/** Fields that must not be written to Firestore this slice (rules undeployed). */
export const ISSUE_PHOTO_LOCAL_ONLY_KEYS = [
  'photoStatus',
  'photoError',
  'photoBytes',
  'photoWidth',
  'photoHeight',
  'photoContentType',
  'photoHash',
  'photoFreenetUri',
] as const;

export type IssuePhotoLocalFields = {
  photoStatus?: IssuePhotoStatus;
  photoError?: string;
  photoBytes?: number;
  photoWidth?: number;
  photoHeight?: number;
  photoContentType?: string;
  photoHash?: string;
  photoFreenetUri?: string;
};

export function issueHasPhoto(
  issue: Pick<FieldIssue, 'photoUrl' | 'photoData' | 'photos'> & IssuePhotoLocalFields,
): boolean {
  return Boolean(
    (issue.photos && issue.photos.length > 0) ||
      issue.photoUrl ||
      issue.photoData ||
      issue.photoHash ||
      issue.photoFreenetUri ||
      issue.photoBytes,
  );
}

export function omitIssuePhotoLocalFields<T extends Record<string, unknown>>(
  row: T,
): T {
  const out = { ...row };
  for (const key of ISSUE_PHOTO_LOCAL_ONLY_KEYS) delete out[key];
  const record = out as Record<string, unknown>;
  if (Array.isArray(record.photos)) {
    const cleaned = photosForFirestore(record.photos as FarmPhotoRef[]);
    if (cleaned) record.photos = cleaned;
    else delete record.photos;
  }
  return out;
}

/** Keep local photo pointers when an incoming Hot row has none (LWW without a photo). */
export function keepIssuePhotoIfMissing(prev: FieldIssue, next: FieldIssue): FieldIssue {
  const nextPhotos = listIssuePhotoRefs(next);
  if (nextPhotos.length > 0) return next;
  const prevPhotos = listIssuePhotoRefs(prev);
  if (prevPhotos.length === 0) return next;
  return {
    ...next,
    photos: prevPhotos,
    photoFreenetUri: prev.photoFreenetUri,
    photoHash: prev.photoHash,
    photoBytes: prev.photoBytes,
    photoWidth: prev.photoWidth,
    photoHeight: prev.photoHeight,
    photoContentType: prev.photoContentType,
    photoStatus: prev.photoStatus,
    photoError: prev.photoError,
    photoData: next.photoData || prev.photoData,
    photoUrl: next.photoUrl || prev.photoUrl,
  };
}

function issueStamp(row: FieldIssue): number {
  return Date.parse(row.updatedAt || row.reportedAt || row.archivedAt || '') || 0;
}

/** Union by id + LWW. A tablet snapshot must not drop Linux-only issues. */
export function unionIssuesByUpdatedAt(local: FieldIssue[], incoming: FieldIssue[]): FieldIssue[] {
  const byId = new Map<string, FieldIssue>();
  for (const row of local) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of incoming) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    if (!prev || issueStamp(row) >= issueStamp(prev)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function mergeIssuesKeepingPhotos(local: FieldIssue[], incoming: FieldIssue[]): FieldIssue[] {
  const localById = new Map(local.map((row) => [row.id, row]));
  return unionIssuesByUpdatedAt(local, incoming).map((row) => {
    const prev = localById.get(row.id);
    return prev ? keepIssuePhotoIfMissing(prev, row) : row;
  });
}
