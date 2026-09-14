/**
 * Shared farm-photo identity: max 5, opaque file ids, hosted / export / Freenet
 * path helpers. Who / where / when live on the record, never in the file name.
 *
 * @see Plans/NAMING.md §8 · Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

export type FarmPhotoStatus = 'local' | 'uploading' | 'ready' | 'failed';

type IssuePhotoLegacy = {
  photos?: FarmPhotoRef[];
  photoUrl?: string;
  photoData?: string;
  photoBytes?: number;
  photoWidth?: number;
  photoHeight?: number;
  photoContentType?: string;
  photoHash?: string;
  photoFreenetUri?: string;
  photoStatus?: FarmPhotoStatus;
  photoError?: string;
  reportedAt?: string;
  reportedBy?: string;
};

export const MAX_PHOTOS_PER_RECORD = 5;
/** First / legacy issue Storage object: `…/issues/{issueId}/photo.jpg`. */
export const LEGACY_PHOTO_ID = 'photo';
export const FARM_PHOTO_CACHE_DB = 'pufam_issue_photos';

export type FarmPhotoKind = 'issue' | 'event';

export type FarmPhotoRef = {
  id: string;
  createdAt: string;
  createdBy: string;
  blockId?: string;
  directedAtUid?: string;
  directedAtName?: string;
  url?: string;
  bytes?: number;
  width?: number;
  height?: number;
  contentType?: string;
  status?: FarmPhotoStatus;
  error?: string;
  hash?: string;
  freenetUri?: string;
};

export class TooManyPhotosError extends Error {
  readonly code = 'too-many-photos';
  constructor(max: number = MAX_PHOTOS_PER_RECORD) {
    super(`This record already has ${max} photos — remove one to add another.`);
    this.name = 'TooManyPhotosError';
  }
}

const PHOTO_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export function isFarmPhotoId(value: string): boolean {
  return PHOTO_ID_RE.test(value) && !value.includes('..');
}

/** Opaque id. First photo on an empty issue stays `photo` so Storage keeps `photo.jpg`. */
export function nextFarmPhotoId(existing: readonly { id: string }[]): string {
  if (existing.length === 0) return LEGACY_PHOTO_ID;
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `p${raw.slice(0, 10)}`;
}

export function assertCanAddPhoto(count: number): void {
  if (count >= MAX_PHOTOS_PER_RECORD) throw new TooManyPhotosError();
}

export function hostedPhotoStoragePath(
  kind: FarmPhotoKind,
  farmId: string,
  recordId: string,
  photoId: string = LEGACY_PHOTO_ID,
): string {
  const folder = kind === 'event' ? 'events' : 'issues';
  return `farms/${farmId}/${folder}/${recordId}/${photoId}.jpg`;
}

/** Flat export sidecar name — no paddock or person names. */
export function exportPhotoZipName(recordId: string, photoId: string): string {
  return `photos/${recordId}_${photoId}.jpg`;
}

export function farmPhotoCacheId(
  kind: FarmPhotoKind,
  farmId: string,
  recordId: string,
  photoId: string,
): string {
  return `${farmId}:${kind}:${recordId}:${photoId}`;
}

export function legacyIssuePhotoCacheId(farmId: string, issueId: string): string {
  return `${farmId}:${issueId}`;
}

export function photoOutboxRowId(
  kind: FarmPhotoKind,
  farmId: string,
  recordId: string,
  photoId: string,
): string {
  return `${farmId}:${kind}:${recordId}:${photoId}`;
}

export function listIssuePhotoRefs(issue: IssuePhotoLegacy): FarmPhotoRef[] {
  if (issue.photos && issue.photos.length > 0) return issue.photos;
  if (!issue.photoUrl && !issue.photoData && !issue.photoHash && !issue.photoFreenetUri && !issue.photoBytes) {
    return [];
  }
  return [
    {
      id: LEGACY_PHOTO_ID,
      createdAt: issue.reportedAt || '',
      createdBy: issue.reportedBy || '',
      url: issue.photoUrl,
      bytes: issue.photoBytes,
      width: issue.photoWidth,
      height: issue.photoHeight,
      contentType: issue.photoContentType,
      status: issue.photoStatus,
      error: issue.photoError,
      hash: issue.photoHash,
      freenetUri: issue.photoFreenetUri,
    },
  ];
}

export function listEventPhotoRefs(event: { photos?: FarmPhotoRef[] }): FarmPhotoRef[] {
  return event.photos ?? [];
}

export function keepEventPhotosIfMissing<T extends { photos?: FarmPhotoRef[] }>(prev: T, next: T): T {
  if (listEventPhotoRefs(next).length > 0) return next;
  const prevPhotos = listEventPhotoRefs(prev);
  if (prevPhotos.length === 0) return next;
  return { ...next, photos: prevPhotos };
}

export function withPhotosForFirestore<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  if (Array.isArray(out.photos)) {
    const cleaned = photosForFirestore(out.photos as FarmPhotoRef[]);
    if (cleaned) out.photos = cleaned;
    else delete out.photos;
  }
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out as T;
}

export function photosForFirestore(photos: FarmPhotoRef[] | undefined): FarmPhotoRef[] | undefined {
  if (!photos?.length) return undefined;
  return photos.slice(0, MAX_PHOTOS_PER_RECORD).map((photo) => ({
    id: photo.id,
    createdAt: photo.createdAt,
    createdBy: photo.createdBy,
    ...(photo.blockId ? { blockId: photo.blockId } : {}),
    ...(photo.directedAtUid ? { directedAtUid: photo.directedAtUid } : {}),
    ...(photo.directedAtName ? { directedAtName: photo.directedAtName } : {}),
    ...(photo.url ? { url: photo.url } : {}),
    ...(photo.bytes != null ? { bytes: photo.bytes } : {}),
    ...(photo.width != null ? { width: photo.width } : {}),
    ...(photo.height != null ? { height: photo.height } : {}),
    ...(photo.contentType ? { contentType: photo.contentType } : {}),
  }));
}

export function upsertPhotoRef(list: FarmPhotoRef[], next: FarmPhotoRef): FarmPhotoRef[] {
  const without = list.filter((row) => row.id !== next.id);
  without.push(next);
  return without.slice(0, MAX_PHOTOS_PER_RECORD);
}

export function removePhotoRef(list: FarmPhotoRef[], photoId: string): FarmPhotoRef[] {
  return list.filter((row) => row.id !== photoId);
}

export function directedAtFromEvent(event: {
  assignedTo?: string;
  assignedToName?: string;
}): Pick<FarmPhotoRef, 'directedAtUid' | 'directedAtName'> {
  return {
    ...(event.assignedTo ? { directedAtUid: event.assignedTo } : {}),
    ...(event.assignedToName ? { directedAtName: event.assignedToName } : {}),
  };
}

export function syncLegacyIssuePhotoFields(
  photos: FarmPhotoRef[],
): Omit<IssuePhotoLegacy, 'reportedAt' | 'reportedBy' | 'photoData'> {
  const first = photos[0];
  if (!first) {
    return {
      photos: [],
      photoUrl: '',
      photoBytes: undefined,
      photoWidth: undefined,
      photoHeight: undefined,
      photoContentType: undefined,
      photoHash: undefined,
      photoFreenetUri: undefined,
      photoStatus: undefined,
      photoError: undefined,
    };
  }
  return {
    photos,
    photoUrl: first.url || '',
    photoBytes: first.bytes,
    photoWidth: first.width,
    photoHeight: first.height,
    photoContentType: first.contentType,
    photoHash: first.hash,
    photoFreenetUri: first.freenetUri,
    photoStatus: first.status,
    photoError: first.error,
  };
}
