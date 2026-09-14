/**
 * Upload queued field and diary photos to Firebase Storage, then patch records.
 */
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { storageApi } from '../services/storage';
import {
  listPhotoOutbox,
  removePhotoOutbox,
  type PhotoOutboxRow,
} from './photoOutbox';
import { usesCloudSyncOutbox } from './farmPipes';
import { isLocalOnlyFarmSession } from './workshopMode';
import { useFieldStore } from './fieldStore';
import { useFarmDiaryStore } from './farmDiaryStore';
import {
  LEGACY_PHOTO_ID,
  listEventPhotoRefs,
  listIssuePhotoRefs,
  photosForFirestore,
  syncLegacyIssuePhotoFields,
  upsertPhotoRef,
} from './farmPhoto';

function isPermissionOrOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'permission-denied' ||
    code === 'unavailable' ||
    code === 'storage/unauthorized' ||
    msg.includes('offline') ||
    msg.includes('network')
  );
}

async function flushIssueRow(row: PhotoOutboxRow): Promise<void> {
  const photoId = row.photoId || LEGACY_PHOTO_ID;
  const photoUrl = await storageApi.uploadFieldIssuePhoto(row.farmId, row.issueId, row.blob, photoId);
  const issue =
    useFieldStore.getState().issues.find((item) => item.id === row.issueId) ||
    useFieldStore.getState().archivedIssues.find((item) => item.id === row.issueId);
  const photos = upsertPhotoRef(issue ? listIssuePhotoRefs(issue) : [], {
    id: photoId,
    createdAt: row.createdAt,
    createdBy: issue?.reportedBy || '',
    url: photoUrl,
    bytes: row.blob.size,
    contentType: row.blob.type || 'image/jpeg',
    status: 'ready',
    error: '',
  });
  const legacy = syncLegacyIssuePhotoFields(photos);
  const ref = doc(db, `farms/${row.farmId}/issues`, row.issueId);
  try {
    await updateDoc(ref, {
      photoUrl: legacy.photoUrl || photoUrl,
      photos: photosForFirestore(photos) || [],
      photoData: deleteField(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[flushPhotoOutbox] Firestore patch failed (local update still applied)', err);
  }
  await useFieldStore.getState().updateIssue(
    row.farmId,
    row.issueId,
    { ...legacy, photoData: '', photoStatus: 'ready', photoError: '' },
    { publishHot: false },
  );
  await removePhotoOutbox(row.id);
}

async function flushEventRow(row: PhotoOutboxRow): Promise<void> {
  const eventId = row.eventId || row.issueId;
  const photoId = row.photoId || LEGACY_PHOTO_ID;
  const photoUrl = await storageApi.uploadEventPhoto(row.farmId, eventId, row.blob, photoId);
  const event = useFarmDiaryStore.getState().events.find((item) => item.id === eventId);
  const photos = upsertPhotoRef(event ? listEventPhotoRefs(event) : [], {
    id: photoId,
    createdAt: row.createdAt,
    createdBy: event?.createdBy || '',
    ...(event?.blockId ? { blockId: event.blockId } : {}),
    url: photoUrl,
    bytes: row.blob.size,
    contentType: row.blob.type || 'image/jpeg',
    status: 'ready',
    error: '',
  });
  const ref = doc(db, `farms/${row.farmId}/events`, eventId);
  try {
    await updateDoc(ref, {
      photos: photosForFirestore(photos) || [],
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[flushPhotoOutbox] Firestore event patch failed (local update still applied)', err);
  }
  await useFarmDiaryStore.getState().updateEvent(row.farmId, true, eventId, { photos }, {
    publishHot: false,
  });
  await removePhotoOutbox(row.id);
}

async function flushOne(row: PhotoOutboxRow): Promise<void> {
  if (row.kind === 'event') return flushEventRow(row);
  return flushIssueRow(row);
}

export async function flushPhotoOutbox(
  farmId?: string
): Promise<{ flushed: number; failed: number }> {
  if (isLocalOnlyFarmSession() || !usesCloudSyncOutbox()) return { flushed: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { flushed: 0, failed: 0 };
  }

  const rows = await listPhotoOutbox(farmId);
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let flushed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await flushOne(row);
      flushed += 1;
    } catch (error) {
      if (isPermissionOrOfflineError(error)) {
        failed += 1;
        break;
      }
      console.warn('[flushPhotoOutbox] failed', row.id, error);
      failed += 1;
    }
  }
  return { flushed, failed };
}
