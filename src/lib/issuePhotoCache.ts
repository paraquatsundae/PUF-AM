/**
 * On-device JPEG cache for issue and diary/event photos (Freenet display +
 * pre-upload). Cloud uploads still queue in `pufom_photo_outbox`.
 *
 * @see Plans/NAMING.md §4 · Plans/LOCAL_DATA_STORAGE.md
 */

import {
  FARM_PHOTO_CACHE_DB,
  farmPhotoCacheId,
  legacyIssuePhotoCacheId,
  type FarmPhotoKind,
} from './farmPhoto';
import type { FarmPhotoStatus } from './farmPhoto';

export const ISSUE_PHOTO_DB = FARM_PHOTO_CACHE_DB;
export const ISSUE_PHOTO_DB_VERSION = 1;
export const ISSUE_PHOTO_STORE = 'photos';

export type IssuePhotoCacheRow = {
  id: string;
  farmId: string;
  kind?: FarmPhotoKind;
  issueId?: string;
  eventId?: string;
  recordId?: string;
  photoId?: string;
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
  contentType: string;
  status: FarmPhotoStatus;
  error?: string;
  freenetUri?: string;
  contentHash?: string;
  updatedAt: string;
};

export function issuePhotoCacheId(
  farmId: string,
  issueId: string,
  photoId = 'photo',
): string {
  return farmPhotoCacheId('issue', farmId, issueId, photoId);
}

export function eventPhotoCacheId(farmId: string, eventId: string, photoId: string): string {
  return farmPhotoCacheId('event', farmId, eventId, photoId);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ISSUE_PHOTO_DB, ISSUE_PHOTO_DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('issue photo IDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ISSUE_PHOTO_STORE)) {
        const store = db.createObjectStore(ISSUE_PHOTO_STORE, { keyPath: 'id' });
        store.createIndex('byFarm', 'farmId', { unique: false });
      }
    };
  });
}

export async function putIssuePhotoCache(row: IssuePhotoCacheRow): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ISSUE_PHOTO_STORE, 'readwrite');
    tx.objectStore(ISSUE_PHOTO_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getById(id: string): Promise<IssuePhotoCacheRow | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ISSUE_PHOTO_STORE, 'readonly');
    const req = tx.objectStore(ISSUE_PHOTO_STORE).get(id);
    req.onsuccess = () => resolve((req.result as IssuePhotoCacheRow) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getIssuePhotoCache(
  farmId: string,
  issueId: string,
  photoId = 'photo',
): Promise<IssuePhotoCacheRow | null> {
  const row = await getById(issuePhotoCacheId(farmId, issueId, photoId));
  if (row) return row;
  if (photoId === 'photo') return getById(legacyIssuePhotoCacheId(farmId, issueId));
  return null;
}

export async function getEventPhotoCache(
  farmId: string,
  eventId: string,
  photoId: string,
): Promise<IssuePhotoCacheRow | null> {
  return getById(eventPhotoCacheId(farmId, eventId, photoId));
}

export async function deleteFarmPhotoCache(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ISSUE_PHOTO_STORE, 'readwrite');
    tx.objectStore(ISSUE_PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listIssuePhotoCache(farmId: string): Promise<IssuePhotoCacheRow[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ISSUE_PHOTO_STORE, 'readonly');
    const req = tx.objectStore(ISSUE_PHOTO_STORE).index('byFarm').getAll(farmId);
    req.onsuccess = () => resolve((req.result as IssuePhotoCacheRow[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function farmHasUploadingIssuePhoto(farmId: string): Promise<boolean> {
  const rows = await listIssuePhotoCache(farmId);
  return rows.some((row) => row.status === 'uploading' || row.status === 'failed');
}
