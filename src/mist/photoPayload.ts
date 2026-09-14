/**
 * Farm-photo plaintext (before HotKey AEAD) and the farm photo index.
 * Crew decrypt with HotKey — never FarmSeed. Index holds issue + event slots.
 *
 * @see Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

import { hotKey } from '../../units/mist-freenet/src/keys.ts';
import { LEGACY_PHOTO_ID, type FarmPhotoKind } from '../lib/farmPhoto.ts';

export const ISSUE_PHOTO_KIND = 'issue-photo' as const;
export const EVENT_PHOTO_KIND = 'event-photo' as const;
export const PHOTO_INDEX_KIND = 'photo-index' as const;
export const PHOTO_BLOB_MAGIC = 'PUFPH1\n';

const FARMSEED_KEYS = ['farmSeed', 'farmSeedHex', 'farmCode', 'FarmSeed', 'FarmCode'];

export class IssuePhotoPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IssuePhotoPayloadError';
  }
}

export function assertNoFarmSeedInPhotoValue(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  for (const key of FARMSEED_KEYS) {
    if (o[key] != null && o[key] !== '') {
      throw new IssuePhotoPayloadError('Issue photo payload must not carry FarmSeed or a FarmCode');
    }
  }
}

export type IssuePhotoMeta = {
  v: 1;
  kind: typeof ISSUE_PHOTO_KIND | typeof EVENT_PHOTO_KIND;
  farmId: string;
  issueId?: string;
  eventId?: string;
  photoId: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
};

export type IssuePhotoIndexEntry = {
  kind: FarmPhotoKind;
  recordId: string;
  photoId: string;
  /** Back-compat: same as recordId when kind is issue. */
  issueId?: string;
  eventId?: string;
  uri: string;
  contentHash: string;
  bytes: number;
  width: number;
  height: number;
  contentType: string;
  updatedAt: string;
};

export type IssuePhotoIndex = {
  v: 1;
  kind: typeof PHOTO_INDEX_KIND;
  farmId: string;
  updatedAt: string;
  photos: IssuePhotoIndexEntry[];
};

export function issuePhotoStorageKey(
  farmId: string,
  issueId: string,
  photoId: string = LEGACY_PHOTO_ID,
): string {
  return photoId === LEGACY_PHOTO_ID
    ? hotKey(farmId, `photo/${issueId}`)
    : hotKey(farmId, `photo/${issueId}/${photoId}`);
}

export function eventPhotoStorageKey(farmId: string, eventId: string, photoId: string): string {
  return hotKey(farmId, `photo/event/${eventId}/${photoId}`);
}

export function photoIndexStorageKey(farmId: string): string {
  return hotKey(farmId, 'photos');
}

export function packIssuePhotoBlob(meta: IssuePhotoMeta, jpeg: Uint8Array): Uint8Array {
  assertNoFarmSeedInPhotoValue(meta);
  if (meta.v !== 1 || (meta.kind !== ISSUE_PHOTO_KIND && meta.kind !== EVENT_PHOTO_KIND)) {
    throw new IssuePhotoPayloadError('Photo meta is not a v1 farm photo');
  }
  const head = new TextEncoder().encode(`${PHOTO_BLOB_MAGIC}${JSON.stringify(meta)}\n`);
  const out = new Uint8Array(head.byteLength + jpeg.byteLength);
  out.set(head, 0);
  out.set(jpeg, head.byteLength);
  return out;
}

export function parseIssuePhotoBlob(bytes: Uint8Array): { meta: IssuePhotoMeta; jpeg: Uint8Array } {
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 2048)));
  if (!text.startsWith(PHOTO_BLOB_MAGIC)) {
    throw new IssuePhotoPayloadError('Issue photo blob is missing PUFPH1 header');
  }
  const rest = text.slice(PHOTO_BLOB_MAGIC.length);
  const nl = rest.indexOf('\n');
  if (nl < 0) throw new IssuePhotoPayloadError('Issue photo blob header is incomplete');
  const json = rest.slice(0, nl);
  const headBytes = new TextEncoder().encode(PHOTO_BLOB_MAGIC + json + '\n');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new IssuePhotoPayloadError('Issue photo meta is not valid JSON');
  }
  assertNoFarmSeedInPhotoValue(parsed);
  const raw = parsed as IssuePhotoMeta & { issueId?: string };
  const kind = raw.kind === EVENT_PHOTO_KIND ? EVENT_PHOTO_KIND : ISSUE_PHOTO_KIND;
  const photoId = typeof raw.photoId === 'string' && raw.photoId ? raw.photoId : LEGACY_PHOTO_ID;
  if (raw.v !== 1 || (kind === ISSUE_PHOTO_KIND && !raw.issueId) || (kind === EVENT_PHOTO_KIND && !raw.eventId)) {
    throw new IssuePhotoPayloadError('Issue photo meta is not a v1 farm photo');
  }
  const meta: IssuePhotoMeta = {
    v: 1,
    kind,
    farmId: raw.farmId,
    issueId: raw.issueId,
    eventId: raw.eventId,
    photoId,
    contentType: raw.contentType,
    width: raw.width,
    height: raw.height,
    bytes: raw.bytes,
  };
  return { meta, jpeg: bytes.subarray(headBytes.byteLength) };
}

function normalizeIndexEntry(p: Record<string, unknown>, fallbackUpdatedAt: string): IssuePhotoIndexEntry | null {
  assertNoFarmSeedInPhotoValue(p);
  const kind: FarmPhotoKind = p.kind === 'event' || typeof p.eventId === 'string' && p.eventId && !p.issueId
    ? 'event'
    : 'issue';
  const recordId =
    (typeof p.recordId === 'string' && p.recordId) ||
    (kind === 'event' && typeof p.eventId === 'string' ? p.eventId : '') ||
    (typeof p.issueId === 'string' ? p.issueId : '');
  const photoId = typeof p.photoId === 'string' && p.photoId ? p.photoId : LEGACY_PHOTO_ID;
  const uri = typeof p.uri === 'string' ? p.uri : '';
  const contentHash = typeof p.contentHash === 'string' ? p.contentHash : '';
  if (!recordId || !uri || contentHash.length !== 64) return null;
  return {
    kind,
    recordId,
    photoId,
    issueId: kind === 'issue' ? recordId : undefined,
    eventId: kind === 'event' ? recordId : undefined,
    uri,
    contentHash,
    bytes: typeof p.bytes === 'number' ? p.bytes : 0,
    width: typeof p.width === 'number' ? p.width : 0,
    height: typeof p.height === 'number' ? p.height : 0,
    contentType: typeof p.contentType === 'string' ? p.contentType : 'image/jpeg',
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : fallbackUpdatedAt,
  };
}

export function parsePhotoIndex(value: unknown): IssuePhotoIndex {
  assertNoFarmSeedInPhotoValue(value);
  if (!value || typeof value !== 'object') {
    throw new IssuePhotoPayloadError('Photo index is not an object');
  }
  const o = value as Record<string, unknown>;
  if (o.v !== 1 || o.kind !== PHOTO_INDEX_KIND) {
    throw new IssuePhotoPayloadError('Photo index is not a v1 photo-index');
  }
  const farmId = typeof o.farmId === 'string' ? o.farmId.trim() : '';
  const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : '';
  if (!farmId || !updatedAt || !Array.isArray(o.photos)) {
    throw new IssuePhotoPayloadError('Photo index is missing farmId, photos, or updatedAt');
  }
  const photos: IssuePhotoIndexEntry[] = [];
  for (const row of o.photos) {
    if (!row || typeof row !== 'object') continue;
    const entry = normalizeIndexEntry(row as Record<string, unknown>, updatedAt);
    if (entry) photos.push(entry);
  }
  return { v: 1, kind: PHOTO_INDEX_KIND, farmId, updatedAt, photos };
}

function samePhotoSlot(a: IssuePhotoIndexEntry, b: Pick<IssuePhotoIndexEntry, 'kind' | 'recordId' | 'photoId'>): boolean {
  return a.kind === b.kind && a.recordId === b.recordId && a.photoId === b.photoId;
}

export function upsertPhotoIndexEntry(
  index: IssuePhotoIndex | null,
  farmId: string,
  entry: IssuePhotoIndexEntry,
): IssuePhotoIndex {
  const photos = [...(index?.photos ?? [])].filter((row) => !samePhotoSlot(row, entry));
  photos.push(entry);
  const next: IssuePhotoIndex = {
    v: 1,
    kind: PHOTO_INDEX_KIND,
    farmId,
    updatedAt: entry.updatedAt,
    photos,
  };
  assertNoFarmSeedInPhotoValue(next);
  return next;
}

export function removePhotoIndexEntry(
  index: IssuePhotoIndex | null,
  farmId: string,
  slot: Pick<IssuePhotoIndexEntry, 'kind' | 'recordId' | 'photoId'>,
): IssuePhotoIndex {
  const photos = [...(index?.photos ?? [])].filter((row) => !samePhotoSlot(row, slot));
  const next: IssuePhotoIndex = {
    v: 1,
    kind: PHOTO_INDEX_KIND,
    farmId,
    updatedAt: new Date().toISOString(),
    photos,
  };
  assertNoFarmSeedInPhotoValue(next);
  return next;
}
