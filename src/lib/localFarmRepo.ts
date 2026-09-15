/**
 * Local-first farm entity store (IndexedDB) + universal outbox.
 * Geometry remains in farmGeometryIdb; issues/diary migrate here.
 */
import type { DiaryEvent } from './farmDiary';
import type { FieldIssue } from './fieldStore';
import type { MapHighlightDoc } from './mapHighlights';

export type LocalEntityKind = 'issues' | 'issues_archive' | 'diary' | 'map_highlights';

export type LocalFarmEntity = FieldIssue | DiaryEvent | MapHighlightDoc;

export type OutboxOp = {
  id: string;
  farmId: string;
  kind: LocalEntityKind;
  op: 'upsert' | 'delete';
  entityId: string;
  payload?: LocalFarmEntity;
  updatedAt: string;
  createdAt: string;
  /** Transaction-assigned ordering; legacy operations use createdAt. */
  sequence?: number;
  /** Failed flush attempts with a *permanent* error. Absent on ops from older builds. */
  attempts?: number;
};

const DB_NAME = 'pufom_farm_local';
const DB_VERSION = 1;
const ENTITY_STORE = 'entities';
const OUTBOX_STORE = 'outbox';

type EntityRow = {
  key: string; // farmId:kind
  farmId: string;
  kind: LocalEntityKind;
  items: LocalFarmEntity[];
  updatedAt: string;
};

function entityKey(farmId: string, kind: LocalEntityKind): string {
  return `${farmId}:${kind}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
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
    tx.oncomplete = () => db.close();
    tx.onabort = () => { db.close(); reject(tx.error); };
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
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function enqueue(op: OutboxOp): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).put(op);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

/** Record and delivery intent commit together. No async work inside the transaction. */
async function mutateEntityRow(
  farmId: string,
  kind: LocalEntityKind,
  mutate: (items: LocalFarmEntity[]) => LocalFarmEntity[],
  operation?: OutboxOp
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ENTITY_STORE, OUTBOX_STORE], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Local save aborted'));
      const store = tx.objectStore(ENTITY_STORE);
      const request = store.get(entityKey(farmId, kind));
      request.onsuccess = () => {
        try {
          const row: EntityRow = request.result ?? {
            key: entityKey(farmId, kind), farmId, kind, items: [], updatedAt: '',
          };
          store.put({ ...row, items: mutate(row.items), updatedAt: new Date().toISOString() });
          if (operation) {
            const outbox = tx.objectStore(OUTBOX_STORE);
            const pending = outbox.getAll();
            pending.onsuccess = () => {
              try {
                const sequence = (pending.result as OutboxOp[])
                  .reduce((max, op) => Math.max(max, op.sequence ?? 0), 0) + 1;
                outbox.add({ ...operation, sequence });
              } catch {
                tx.abort();
              }
            };
          }
        } catch {
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}

export async function listLocalEntities<T extends LocalFarmEntity>(
  farmId: string,
  kind: LocalEntityKind
): Promise<T[]> {
  const row = await getRow(farmId, kind);
  return row.items as T[];
}

export async function upsertLocalEntity(
  farmId: string,
  kind: LocalEntityKind,
  entity: LocalFarmEntity,
  opts?: { queueCloud?: boolean }
): Promise<void> {
  const id = entity.id;
  const stamped = {
    ...entity,
    updatedAt: (entity as { updatedAt?: string }).updatedAt || new Date().toISOString(),
  } as LocalFarmEntity;
  const operation: OutboxOp | undefined = opts?.queueCloud === false ? undefined : {
      id: crypto.randomUUID(),
      farmId,
      kind,
      op: 'upsert',
      entityId: id,
      payload: stamped,
      updatedAt: (stamped as { updatedAt?: string }).updatedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  await mutateEntityRow(farmId, kind, (existing) => {
    const items = [...existing];
    const idx = items.findIndex((item) => item.id === id);
    if (idx >= 0) items[idx] = stamped;
    else items.push(stamped);
    return items;
  }, operation);
}

export async function deleteLocalEntity(
  farmId: string,
  kind: LocalEntityKind,
  entityId: string,
  opts?: { queueCloud?: boolean }
): Promise<void> {
  const operation: OutboxOp | undefined = opts?.queueCloud === false ? undefined : {
      id: crypto.randomUUID(),
      farmId,
      kind,
      op: 'delete',
      entityId,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  await mutateEntityRow(farmId, kind, (items) => items.filter((i) => i.id !== entityId), operation);
}

export async function replaceLocalEntities(
  farmId: string,
  kind: LocalEntityKind,
  items: LocalFarmEntity[]
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
    tx.oncomplete = () => db.close();
    tx.onabort = () => { db.close(); reject(tx.error); };
    const store = tx.objectStore(OUTBOX_STORE);
    const req = farmId ? store.index('byFarm').getAll(farmId) : store.getAll();
    req.onsuccess = () => resolve((req.result as OutboxOp[]) || []);
    req.onerror = () => reject(req.error);
  });
}

/** Re-writes an op in place (same id) — used to persist the failed-attempt count. */
export async function putOutboxOp(op: OutboxOp): Promise<void> {
  return enqueue(op);
}

export async function removeOutboxOp(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function pendingOutboxCount(farmId: string): Promise<number> {
  const ops = await listOutbox(farmId);
  return ops.length;
}

export type LocalFarmEntityCounts = {
  diary: number;
  issues: number;
  issuesArchive: number;
  highlights: number;
  outbox: number;
};

export async function countLocalFarmEntities(farmId: string): Promise<LocalFarmEntityCounts> {
  const [diary, issues, issuesArchive, highlights, outbox] = await Promise.all([
    listLocalEntities(farmId, 'diary'),
    listLocalEntities(farmId, 'issues'),
    listLocalEntities(farmId, 'issues_archive'),
    listLocalEntities(farmId, 'map_highlights'),
    listOutbox(farmId),
  ]);
  return {
    diary: diary.length,
    issues: issues.length,
    issuesArchive: issuesArchive.length,
    highlights: highlights.length,
    outbox: outbox.length,
  };
}

/** Wipe diary/issues for one farm; returns counts before wipe. Outbox cleared too. */
export async function wipeLocalFarmEntitiesForFarm(farmId: string): Promise<LocalFarmEntityCounts> {
  const before = await countLocalFarmEntities(farmId);
  await Promise.all([
    replaceLocalEntities(farmId, 'diary', []),
    replaceLocalEntities(farmId, 'issues', []),
    replaceLocalEntities(farmId, 'issues_archive', []),
    replaceLocalEntities(farmId, 'map_highlights', []),
  ]);

  const ops = await listOutbox(farmId);
  await Promise.all(ops.map((op) => removeOutboxOp(op.id)));

  return before;
}
