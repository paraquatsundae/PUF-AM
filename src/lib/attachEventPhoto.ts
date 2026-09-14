/**
 * Attach or remove a compressed diary/event photo. Wire is Firestore `events`.
 * Same compressor and cap as issue photos. Freenet: HotKey only.
 *
 * @see Plans/NAMING.md §8 · Plans/FREENET_NETWORK_PACK.md Decision 2026-09-14
 */

import {
  assertCanAddPhoto,
  directedAtFromEvent,
  farmPhotoCacheId,
  listEventPhotoRefs,
  nextFarmPhotoId,
  removePhotoRef,
  upsertPhotoRef,
  type FarmPhotoRef,
} from './farmPhoto';
import { isFreenetFarm, usesCloudSyncOutbox } from './farmPipes';
import { useFarmDiaryStore } from './farmDiaryStore';
import { flushPhotoOutbox } from './flushPhotoOutbox';
import { deleteFarmPhotoCache, putIssuePhotoCache } from './issuePhotoCache';
import { compressFarmPhoto, type CompressedFarmPhoto } from './photoCompress';
import { enqueueEventPhoto } from './photoOutbox';

export type AttachEventPhotoInput = {
  createdBy: string;
};

export type AttachEventPhotoResult = {
  compressed: CompressedFarmPhoto;
  photoId: string;
  pipe: 'cloud' | 'freenet' | 'local';
};

async function patchEvent(
  farmId: string,
  eventId: string,
  photos: FarmPhotoRef[],
  opts: { queueCloud: boolean; publishHot: boolean },
): Promise<void> {
  await useFarmDiaryStore.getState().updateEvent(farmId, true, eventId, { photos }, opts);
}

function currentEvent(eventId: string) {
  return useFarmDiaryStore.getState().events.find((row) => row.id === eventId) ?? null;
}

function cacheRow(
  farmId: string,
  eventId: string,
  photoId: string,
  compressed: CompressedFarmPhoto,
  extra: Pick<import('./issuePhotoCache').IssuePhotoCacheRow, 'status'> &
    Partial<import('./issuePhotoCache').IssuePhotoCacheRow>,
): import('./issuePhotoCache').IssuePhotoCacheRow {
  return {
    id: farmPhotoCacheId('event', farmId, eventId, photoId),
    farmId,
    kind: 'event' as const,
    eventId,
    recordId: eventId,
    photoId,
    blob: compressed.blob,
    bytes: compressed.bytes,
    width: compressed.width,
    height: compressed.height,
    contentType: compressed.contentType,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

export async function attachEventPhoto(
  farmId: string,
  eventId: string,
  source: Blob,
  meta: AttachEventPhotoInput,
): Promise<AttachEventPhotoResult> {
  const event = currentEvent(eventId);
  const existing = event ? listEventPhotoRefs(event) : [];
  assertCanAddPhoto(existing.length);
  const photoId = nextFarmPhotoId(existing);
  const compressed = await compressFarmPhoto(source);
  const now = new Date().toISOString();
  const ref: FarmPhotoRef = {
    id: photoId,
    createdAt: now,
    createdBy: meta.createdBy,
    ...(event?.blockId ? { blockId: event.blockId } : {}),
    ...(event ? directedAtFromEvent(event) : {}),
    bytes: compressed.bytes,
    width: compressed.width,
    height: compressed.height,
    contentType: compressed.contentType,
    status: 'uploading',
  };
  const photos = upsertPhotoRef(existing, ref);

  await putIssuePhotoCache(cacheRow(farmId, eventId, photoId, compressed, { status: 'uploading' }));
  await patchEvent(farmId, eventId, photos, { queueCloud: false, publishHot: false });

  if (usesCloudSyncOutbox()) {
    await enqueueEventPhoto(farmId, eventId, compressed.blob, photoId);
    try {
      await flushPhotoOutbox(farmId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await putIssuePhotoCache(
        cacheRow(farmId, eventId, photoId, compressed, { status: 'failed', error: message }),
      );
      await patchEvent(
        farmId,
        eventId,
        upsertPhotoRef(photos, { ...ref, status: 'failed', error: message }),
        { queueCloud: false, publishHot: false },
      );
      throw error;
    }
    return { compressed, photoId, pipe: 'cloud' };
  }

  if (isFreenetFarm()) {
    try {
      const jpeg = new Uint8Array(await compressed.blob.arrayBuffer());
      const { publishEventPhotoToFreenet } = await import('../mist/mistPhotoFreenet');
      const published = await publishEventPhotoToFreenet({
        farmId,
        eventId,
        photoId,
        jpeg,
        width: compressed.width,
        height: compressed.height,
        bytes: compressed.bytes,
        contentType: compressed.contentType,
      });
      const status = published.pending ? 'uploading' : 'ready';
      await putIssuePhotoCache(
        cacheRow(farmId, eventId, photoId, compressed, {
          status,
          freenetUri: published.uri,
          contentHash: published.contentHash,
        }),
      );
      await patchEvent(
        farmId,
        eventId,
        upsertPhotoRef(photos, {
          ...ref,
          status,
          hash: published.contentHash,
          freenetUri: published.uri,
          error: '',
        }),
        { queueCloud: false, publishHot: false },
      );
      return { compressed, photoId, pipe: 'freenet' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await putIssuePhotoCache(
        cacheRow(farmId, eventId, photoId, compressed, { status: 'failed', error: message }),
      );
      await patchEvent(
        farmId,
        eventId,
        upsertPhotoRef(photos, { ...ref, status: 'failed', error: message }),
        { queueCloud: false, publishHot: false },
      );
      throw error;
    }
  }

  await putIssuePhotoCache(cacheRow(farmId, eventId, photoId, compressed, { status: 'local' }));
  await patchEvent(farmId, eventId, upsertPhotoRef(photos, { ...ref, status: 'local' }), {
    queueCloud: false,
    publishHot: false,
  });
  return { compressed, photoId, pipe: 'local' };
}

export async function removeEventPhoto(farmId: string, eventId: string, photoId: string): Promise<void> {
  const event = currentEvent(eventId);
  const photos = removePhotoRef(event ? listEventPhotoRefs(event) : [], photoId);
  await deleteFarmPhotoCache(farmPhotoCacheId('event', farmId, eventId, photoId));
  await patchEvent(farmId, eventId, photos, {
    queueCloud: usesCloudSyncOutbox(),
    publishHot: false,
  });
  if (isFreenetFarm()) {
    const { removePhotoFromFreenetIndex } = await import('../mist/mistPhotoFreenet');
    await removePhotoFromFreenetIndex({ farmId, kind: 'event', recordId: eventId, photoId });
  }
}
