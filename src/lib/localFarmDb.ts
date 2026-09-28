/** IndexedDB schema and transaction lifecycle. See Plans/LOCAL_DATA_STORAGE.md §1. */
import type { LocalEntityKind, LocalFarmEntity } from './localFarmRepo';

export const ENTITY_STORE = 'entities_v2';
export const OUTBOX_STORE = 'outbox';
export const META_STORE = 'metadata';
export const OUTBOX_SEQUENCE_KEY = 'outboxSequence';
const DB_NAME = 'pufom_farm_local';
const DB_VERSION = 2;

export type EntityRow = {
  farmId: string;
  kind: LocalEntityKind;
  entityId: string;
  entity: LocalFarmEntity;
  updatedAt: string;
};

/** Synchronous request callbacks must abort too (e.g. a DataCloneError from put). */
export function guardTransaction(tx: IDBTransaction, action: () => void): void {
  try {
    action();
  } catch {
    tx.abort();
  }
}

export function openLocalFarmDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other PUF-AM tabs or windows, then retry the local save.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction!;
      if (blocked) { tx.abort(); return; }
      // Reinstallation/reset owns legacy data disposal; never silently migrate or wipe.
      if (event.oldVersion !== 0) {
        reject(new Error('Local database reset required. Clear PUF-AM local data before reinstalling.'));
        tx.abort();
        return;
      }
      guardTransaction(tx, () => {
        const entities = db.createObjectStore(ENTITY_STORE, {
          keyPath: ['farmId', 'kind', 'entityId'],
        });
        entities.createIndex('byFarmAndKind', ['farmId', 'kind']);
        entities.createIndex('byFarm', 'farmId');
        const metadata = db.createObjectStore(META_STORE);

        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        outbox.createIndex('byFarm', 'farmId');
        metadata.put(0, OUTBOX_SEQUENCE_KEY);
      });
    };
  });
}

/** setResult captures a value; the promise resolves only after the transaction commits. */
export async function farmTransaction<T = void>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, setResult: (value: T) => void) => void
): Promise<T> {
  const db = await openLocalFarmDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('Local transaction aborted'));
      guardTransaction(tx, () => work(tx, (value) => { result = value; }));
    });
  } finally {
    db.close();
  }
}
