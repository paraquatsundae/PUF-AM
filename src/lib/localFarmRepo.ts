/**
 * Local-first farm entity store (IndexedDB) + universal outbox.
 * Geometry remains in farmGeometryIdb; issues/diary migrate here.
 */
import type { DiaryEvent } from './farmDiary';
import type { FieldIssue } from './fieldStore';

export type LocalEntityKind = 'issues' | 'issues_archive' | 'diary';

export type OutboxOp = {
  id: string;
  farmId: string;
  kind: LocalEntityKind;
  op: 'upsert' | 'delete';
  entityId: string;
  payload?: FieldIssue | DiaryEvent;
  updatedAt: string;
  createdAt: string;
};

const DB_NAME = 'pufom_farm_local';
const DB_VERSION = 1;
const ENTITY_STORE = 'entities';
const OUTBOX_STORE = 'outbox';

type EntityRow = {
  key: string; // farmId:kind
  farmId: string;
  kind: LocalEntityKind;
  items: Array<FieldIssue | DiaryEvent>;
  updatedAt: string;
};

function entityKey(farmId: string, kind: LocalEntityKind): string {
  return `${farmId}:${kind}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ENTITY_STORE)) {
        db.createObjectStore(ENTITY_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        store.createIndex('byFarm', 'farmId', { unique: false });
      }
    };
  });
}

async function getRow(farmId: string, kind: LocalEntityKind): Promise<EntityRow> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENTITY_STORE, 'readonly');
    const req = tx.objectStore(ENTITY_STORE).get(entityKey(farmId, kind));
    req.onsuccess = () => {
      resolve(
        (req.result as EntityRow) || {
          key: entityKey(farmId, kind),
          farmId,
          kind,
          items: [],
          updatedAt: new Date(0).toISOString(),
        }
      );
    };
    req.onerror = () => reject(req.error);
  });
}

async function putRow(row: EntityRow): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENTITY_STORE, 'readwrite');
    tx.objectStore(ENTITY_STORE).put({ ...row, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function enqueue(op: OutboxOp): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listLocalEntities<T extends FieldIssue | DiaryEvent>(
  farmId: string,
  kind: LocalEntityKind
): Promise<T[]> {
  const row = await getRow(farmId, kind);
  return row.items as T[];
}

export async function upsertLocalEntity(
  farmId: string,
  kind: LocalEntityKind,
  entity: FieldIssue | DiaryEvent,
  opts?: { queueCloud?: boolean }
): Promise<void> {
  const row = await getRow(farmId, kind);
  const id = entity.id;
  const items = [...row.items];
  const idx = items.findIndex((i) => i.id === id);
  const stamped = {
    ...entity,
    updatedAt: (entity as { updatedAt?: string }).updatedAt || new Date().toISOString(),
  } as FieldIssue | DiaryEvent;
  if (idx >= 0) items[idx] = stamped;
  else items.push(stamped);
  await putRow({ ...row, items });

  if (opts?.queueCloud !== false) {
    await enqueue({
      id: `${kind}:${id}:${Date.now()}`,
      farmId,
      kind,
      op: 'upsert',
      entityId: id,
      payload: stamped,
      updatedAt: (stamped as { updatedAt?: string }).updatedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
}

export async function deleteLocalEntity(
  farmId: string,
  kind: LocalEntityKind,
  entityId: string,
  opts?: { queueCloud?: boolean }
): Promise<void> {
  const row = await getRow(farmId, kind);
  await putRow({ ...row, items: row.items.filter((i) => i.id !== entityId) });
  if (opts?.queueCloud !== false) {
    await enqueue({
      id: `${kind}:del:${entityId}:${Date.now()}`,
      farmId,
      kind,
      op: 'delete',
      entityId,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
}

export async function replaceLocalEntities(
  farmId: string,
  kind: LocalEntityKind,
  items: Array<FieldIssue | DiaryEvent>
): Promise<void> {
  await putRow({
    key: entityKey(farmId, kind),
    farmId,
    kind,
    items,
    updatedAt: new Date().toISOString(),
  });
}

export async function listOutbox(farmId?: string): Promise<OutboxOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const store = tx.objectStore(OUTBOX_STORE);
    const req = farmId ? store.index('byFarm').getAll(farmId) : store.getAll();
    req.onsuccess = () => resolve((req.result as OutboxOp[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOutboxOp(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pendingOutboxCount(farmId: string): Promise<number> {
  const ops = await listOutbox(farmId);
  return ops.length;
}
