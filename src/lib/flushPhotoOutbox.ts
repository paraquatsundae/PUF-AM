/**
 * Upload queued field photos to Firebase Storage, then patch issue docs.
 */
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { storageApi } from '../services/storage';
import {
  listPhotoOutbox,
  removePhotoOutbox,
  type PhotoOutboxRow,
} from './photoOutbox';
import { isLocalOnlyFarmSession } from './workshopMode';
import { useFieldStore } from './fieldStore';

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

async function flushOne(row: PhotoOutboxRow): Promise<void> {
  const photoUrl = await storageApi.uploadFieldIssuePhoto(
    row.farmId,
    row.issueId,
    row.blob
  );
  const ref = doc(db, `farms/${row.farmId}/issues`, row.issueId);
  try {
    await updateDoc(ref, {
      photoUrl,
      photoData: deleteField(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Issue may still be in Firestore outbox — local store update is enough for UI.
    console.warn('[flushPhotoOutbox] Firestore patch failed (local update still applied)', err);
  }
  await useFieldStore.getState().updateIssue(row.farmId, row.issueId, {
    photoUrl,
    photoData: '',
  });
  await removePhotoOutbox(row.id);
}

export async function flushPhotoOutbox(
  farmId?: string
): Promise<{ flushed: number; failed: number }> {
  if (isLocalOnlyFarmSession()) return { flushed: 0, failed: 0 };
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
