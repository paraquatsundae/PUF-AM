/**
 * Flat photo sidecar for farm-export zip.
 * Names are `{recordId}_{photoId}.jpg` — no paddock or person names.
 * Missing Freenet-cached JPEGs are listed, not silently omitted.
 *
 * @see Plans/NAMING.md §8 · Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

import type { DiaryEvent } from './farmDiary';
import type { FieldIssue } from './fieldStore';
import {
  exportPhotoZipName,
  LEGACY_PHOTO_ID,
  listEventPhotoRefs,
  listIssuePhotoRefs,
  type FarmPhotoKind,
  type FarmPhotoRef,
} from './farmPhoto';
import { getEventPhotoCache, getIssuePhotoCache } from './issuePhotoCache';
import { issueHasPhoto } from './issuePhotoMeta';
import { listLocalEntities } from './localFarmRepo';
import { listPhotoOutbox } from './photoOutbox';
import type { FarmExportV1 } from './farmExport';

export type FarmExportMissingPhoto = {
  kind: FarmPhotoKind;
  recordId: string;
  photoId: string;
};

export type FarmExportPhotoBuild = {
  entries: Record<string, Uint8Array>;
  missing: FarmExportMissingPhoto[];
};

export function farmExportPhotoMissingWarning(missing: FarmExportMissingPhoto[]): string {
  const n = missing.length;
  return (
    `${n} photo${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} listed on this farm but this device has no JPEG to put in the zip ` +
    `(often a Freenet-cached photo that has not arrived). This zip is for season review / hand-off — ` +
    `do not treat it as a complete photo archive.`
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const i = dataUrl.indexOf(',');
  if (i < 0) return null;
  const b64 = dataUrl.slice(i + 1);
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
    return bytes;
  } catch {
    return null;
  }
}

async function blobToBytes(blob: Blob): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

async function resolvePhotoBytes(input: {
  farmId: string;
  kind: FarmPhotoKind;
  recordId: string;
  photo: FarmPhotoRef;
  outbox: Map<string, Blob>;
  issuePhotoData?: string;
}): Promise<Uint8Array | null> {
  const outboxKey = `${input.kind}:${input.recordId}:${input.photo.id}`;
  const outboxBlob = input.outbox.get(outboxKey);
  if (outboxBlob) return blobToBytes(outboxBlob);
  const cached =
    input.kind === 'event'
      ? await getEventPhotoCache(input.farmId, input.recordId, input.photo.id)
      : await getIssuePhotoCache(input.farmId, input.recordId, input.photo.id);
  if (cached?.blob) return blobToBytes(cached.blob);
  if (input.issuePhotoData) return dataUrlToBytes(input.issuePhotoData);
  return null;
}

export async function buildFarmExportPhotoEntries(
  farmId: string,
  bundle: FarmExportV1,
): Promise<FarmExportPhotoBuild> {
  const [outboxRows, issues, archived, diary] = await Promise.all([
    listPhotoOutbox(farmId),
    listLocalEntities<FieldIssue>(farmId, 'issues'),
    listLocalEntities<FieldIssue>(farmId, 'issues_archive'),
    listLocalEntities<DiaryEvent>(farmId, 'diary'),
  ]);
  const outbox = new Map<string, Blob>();
  for (const row of outboxRows) {
    const kind = row.kind === 'event' ? 'event' : 'issue';
    const recordId = kind === 'event' ? row.eventId || row.issueId : row.issueId;
    outbox.set(`${kind}:${recordId}:${row.photoId || LEGACY_PHOTO_ID}`, row.blob);
  }

  const entries: Record<string, Uint8Array> = {};
  const missing: FarmExportMissingPhoto[] = [];

  const issueById = new Map([...issues, ...archived].map((row) => [row.id, row]));
  for (const exported of [...bundle.issues, ...bundle.issuesArchive]) {
    if (!exported.hasPhoto) continue;
    const raw = issueById.get(exported.id);
    if (!raw) {
      missing.push({ kind: 'issue', recordId: exported.id, photoId: LEGACY_PHOTO_ID });
      continue;
    }
    const photos = [...listIssuePhotoRefs(raw)];
    if (photos.length === 0 && issueHasPhoto(raw)) {
      photos.push({
        id: LEGACY_PHOTO_ID,
        createdAt: raw.reportedAt,
        createdBy: raw.reportedBy,
      });
    }
    for (const photo of photos) {
      const bytes = await resolvePhotoBytes({
        farmId,
        kind: 'issue',
        recordId: raw.id,
        photo,
        outbox,
        issuePhotoData: raw.photoData,
      });
      if (bytes && bytes.length > 0) {
        entries[exportPhotoZipName(raw.id, photo.id)] = bytes;
      } else {
        missing.push({ kind: 'issue', recordId: raw.id, photoId: photo.id });
      }
    }
  }

  const diaryById = new Map(diary.map((row) => [row.id, row]));
  for (const event of bundle.diary) {
    const raw = diaryById.get(event.id) || event;
    const photos = listEventPhotoRefs(raw);
    for (const photo of photos) {
      const bytes = await resolvePhotoBytes({
        farmId,
        kind: 'event',
        recordId: event.id,
        photo,
        outbox,
      });
      if (bytes && bytes.length > 0) {
        entries[exportPhotoZipName(event.id, photo.id)] = bytes;
      } else {
        missing.push({ kind: 'event', recordId: event.id, photoId: photo.id });
      }
    }
  }

  if (missing.length > 0) {
    entries['photos/MISSING.txt'] = new TextEncoder().encode(
      `${farmExportPhotoMissingWarning(missing)}\n\n` +
        missing.map((row) => `${row.kind} ${row.recordId}_${row.photoId}.jpg`).join('\n') +
        '\n',
    );
  }

  return { entries, missing };
}
