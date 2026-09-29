/**
 * Drop the on-device farm database so the next open creates a fresh schema.
 * Cloud farms stay in Firestore. Auth databases are not touched.
 * Plans/LOCAL_DATA_STORAGE.md §1 — old pufom_farm_local must be deleted, not migrated.
 */
import { LOCAL_FARM_DB_NAME } from './localFarmDb';

export function deleteLocalFarmDatabase(
  factory: Pick<IDBFactory, 'deleteDatabase'> = indexedDB
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(LOCAL_FARM_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not clear local data.'));
    request.onblocked = () =>
      reject(new Error('Close other PUF-AM tabs or windows, then clear local data again.'));
  });
}
