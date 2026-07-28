/**
 * Offline Firebase Storage queue for field-issue photos.
 * Blobs live in IndexedDB until flush; issues keep a compressed photoData preview.
 */

export const PHOTO_OUTBOX_DB = 'pufom_photo_outbox';
export const PHOTO_OUTBOX_VERSION = 1;
export const PHOTO_STORE = 'photos';
/** Keep Firestore photoData under the 1 MB rule with headroom. */
export const MAX_PHOTO_DATA_BYTES = 800_000;

export type PhotoOutboxRow = {
  id: string;
  farmId: string;
  issueId: string;
  path: string;
  blob: Blob;
  createdAt: string;
  status: 'pending' | 'uploading';
};

export function photoStoragePath(farmId: string, issueId: string): string {
  return `farms/${farmId}/issues/${issueId}/photo.jpg`;
}

export function photoOutboxId(farmId: string, issueId: string): string {
  return `${farmId}:${issueId}`;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_OUTBOX_DB, PHOTO_OUTBOX_VERSION);
    req.onerror = () => reject(req.error ?? new Error('photo outbox IDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        store.createIndex('byFarm', 'farmId', { unique: false });
      }
    };
  });
}

export async function enqueuePhoto(
  farmId: string,
  issueId: string,
  blob: Blob
): Promise<PhotoOutboxRow> {
  const row: PhotoOutboxRow = {
    id: photoOutboxId(farmId, issueId),
    farmId,
    issueId,
    path: photoStoragePath(farmId, issueId),
    blob,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return row;
}

export async function listPhotoOutbox(farmId?: string): Promise<PhotoOutboxRow[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const store = tx.objectStore(PHOTO_STORE);
    const req = farmId
      ? store.index('byFarm').getAll(farmId)
      : store.getAll();
    req.onsuccess = () => resolve((req.result as PhotoOutboxRow[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function pendingPhotoCount(farmId?: string): Promise<number> {
  const rows = await listPhotoOutbox(farmId);
  return rows.length;
}

export async function removePhotoOutbox(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Compress a File/Blob to a JPEG data URL under MAX_PHOTO_DATA_BYTES.
 * Returns empty string if canvas is unavailable.
 */
export async function blobToPreviewDataUrl(
  blob: Blob,
  maxBytes: number = MAX_PHOTO_DATA_BYTES
): Promise<string> {
  if (typeof createImageBitmap === 'undefined' && typeof document === 'undefined') {
    return '';
  }
  try {
    const bitmap = await createImageBitmap(blob);
    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return '';
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    let quality = 0.72;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (estimateDataUrlBytes(dataUrl) > maxBytes && quality > 0.35) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    if (estimateDataUrlBytes(dataUrl) > maxBytes) {
      // Shrink further
      const w2 = Math.round(w * 0.7);
      const h2 = Math.round(h * 0.7);
      canvas.width = w2;
      canvas.height = h2;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('preview shrink failed'));
        img.src = dataUrl;
      });
      ctx.drawImage(img, 0, 0, w2, h2);
      dataUrl = canvas.toDataURL('image/jpeg', 0.55);
    }
    return estimateDataUrlBytes(dataUrl) > maxBytes ? '' : dataUrl;
  } catch (err) {
    console.warn('[photoOutbox] preview compress failed', err);
    return '';
  }
}
