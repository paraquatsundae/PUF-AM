/**
 * Local-first farm entity store (IndexedDB) + universal outbox.
 * Geometry remains in farmGeometryIdb; issues/diary migrate here.
 */
import type { DiaryEvent } from './farmDiary';
import type { FieldIssue } from './fieldStore';
import type { MapHighlightDoc } from './mapHighlights';
import {
  ENTITY_STORE, OUTBOX_STORE, META_STORE, OUTBOX_SEQUENCE_KEY,
  farmTransaction, guardTransaction, type EntityRow,
} from './localFarmDb';

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


/** O(1) allocation, in the same transaction as the entity and outbox writes. */
function enqueueInTransaction(tx: IDBTransaction, operation: OutboxOp): void {
  const metadata = tx.objectStore(META_STORE);
  const request = metadata.get(OUTBOX_SEQUENCE_KEY);
  request.onsuccess = () => guardTransaction(tx, () => {
    const sequence = (request.result ?? 0) + 1;
    metadata.put(sequence, OUTBOX_SEQUENCE_KEY);
    tx.objectStore(OUTBOX_STORE).add({ ...operation, sequence });
  });
}

function entityRow(farmId: string, kind: LocalEntityKind, entity: LocalFarmEntity): EntityRow {
  return {
    farmId, kind, entityId: entity.id, entity,
    updatedAt: entity.updatedAt || new Date().toISOString(),
  };
}

export function listLocalEntities<T extends LocalFarmEntity>(
  farmId: string,
  kind: LocalEntityKind
): Promise<T[]> {
  return farmTransaction([ENTITY_STORE], 'readonly', (tx, result) => {
    const request = tx.objectStore(ENTITY_STORE).index('byFarmAndKind').getAll([farmId, kind]);
    request.onsuccess = () => result((request.result as EntityRow[]).map(row => row.entity as T));
  });
}

export function upsertLocalEntity(
  farmId: string,
  kind: LocalEntityKind,
  entity: LocalFarmEntity,
  opts?: { queueCloud?: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  const stamped = { ...entity, updatedAt: entity.updatedAt || now } as LocalFarmEntity;
  const queue = opts?.queueCloud !== false;
  return farmTransaction(queue ? [ENTITY_STORE, OUTBOX_STORE, META_STORE] : [ENTITY_STORE],
    'readwrite', (tx) => {
      tx.objectStore(ENTITY_STORE).put(entityRow(farmId, kind, stamped));
      if (queue) enqueueInTransaction(tx, {
        id: crypto.randomUUID(), farmId, kind, op: 'upsert', entityId: entity.id,
        payload: stamped, updatedAt: stamped.updatedAt!, createdAt: now,
      });
    });
}

export function deleteLocalEntity(
  farmId: string,
  kind: LocalEntityKind,
  entityId: string,
  opts?: { queueCloud?: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  const queue = opts?.queueCloud !== false;
  return farmTransaction(queue ? [ENTITY_STORE, OUTBOX_STORE, META_STORE] : [ENTITY_STORE],
    'readwrite', (tx) => {
      tx.objectStore(ENTITY_STORE).delete([farmId, kind, entityId]);
      if (queue) enqueueInTransaction(tx, {
        id: crypto.randomUUID(), farmId, kind, op: 'delete', entityId,
        updatedAt: now, createdAt: now,
      });
    });
}

/** Explicit snapshot replacement (restore/import), not an individual entity edit. */
export function replaceLocalEntities(
  farmId: string,
  kind: LocalEntityKind,
  items: LocalFarmEntity[]
): Promise<void> {
  return farmTransaction([ENTITY_STORE], 'readwrite', (tx) => {
    const store = tx.objectStore(ENTITY_STORE);
    const request = store.index('byFarmAndKind').openCursor([farmId, kind]);
    request.onsuccess = () => guardTransaction(tx, () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        for (const entity of items) store.put(entityRow(farmId, kind, entity));
      }
    });
  });
}

export function listOutbox(farmId?: string): Promise<OutboxOp[]> {
  return farmTransaction([OUTBOX_STORE], 'readonly', (tx, result) => {
    const store = tx.objectStore(OUTBOX_STORE);
    const request = farmId ? store.index('byFarm').getAll(farmId) : store.getAll();
    request.onsuccess = () => result(request.result as OutboxOp[]);
  });
}

/** Rewrites an operation's failure count while retaining its delivery order. */
export function putOutboxOp(op: OutboxOp): Promise<void> {
  return farmTransaction([OUTBOX_STORE], 'readwrite', (tx) => {
    tx.objectStore(OUTBOX_STORE).put(op);
  });
}

export function removeOutboxOp(id: string): Promise<void> {
  return farmTransaction([OUTBOX_STORE], 'readwrite', (tx) => {
    tx.objectStore(OUTBOX_STORE).delete(id);
  });
}

export function pendingOutboxCount(farmId: string): Promise<number> {
  return farmTransaction([OUTBOX_STORE], 'readonly', (tx, result) => {
    const request = tx.objectStore(OUTBOX_STORE).index('byFarm').count(farmId);
    request.onsuccess = () => result(request.result);
  });
}

export type LocalFarmEntityCounts = {
  diary: number;
  issues: number;
  issuesArchive: number;
  highlights: number;
  outbox: number;
};

const countKinds = {
  diary: 'diary', issues: 'issues', issuesArchive: 'issues_archive', highlights: 'map_highlights',
} as const;

export function countLocalFarmEntities(farmId: string): Promise<LocalFarmEntityCounts> {
  return farmTransaction([ENTITY_STORE, OUTBOX_STORE], 'readonly', (tx, result) => {
    const counts: LocalFarmEntityCounts = { diary: 0, issues: 0, issuesArchive: 0, highlights: 0, outbox: 0 };
    result(counts);
    for (const field of Object.keys(countKinds) as (keyof typeof countKinds)[]) {
      const request = tx.objectStore(ENTITY_STORE).index('byFarmAndKind').count([farmId, countKinds[field]]);
      request.onsuccess = () => { counts[field] = request.result; };
    }
    const request = tx.objectStore(OUTBOX_STORE).index('byFarm').count(farmId);
    request.onsuccess = () => { counts.outbox = request.result; };
  });
}

/** Clear only this farm's records and queue in one transaction; return removed counts. */
export function wipeLocalFarmEntitiesForFarm(farmId: string): Promise<LocalFarmEntityCounts> {
  return farmTransaction([ENTITY_STORE, OUTBOX_STORE], 'readwrite', (tx, result) => {
    const counts: LocalFarmEntityCounts = { diary: 0, issues: 0, issuesArchive: 0, highlights: 0, outbox: 0 };
    result(counts);
    const entities = tx.objectStore(ENTITY_STORE).index('byFarm').openCursor(farmId);
    entities.onsuccess = () => guardTransaction(tx, () => {
      const cursor = entities.result;
      if (!cursor) return;
      const { kind } = cursor.value as EntityRow;
      for (const field of Object.keys(countKinds) as (keyof typeof countKinds)[]) {
        if (countKinds[field] === kind) counts[field]++;
      }
      cursor.delete();
      cursor.continue();
    });
    const outbox = tx.objectStore(OUTBOX_STORE).index('byFarm').openCursor(farmId);
    outbox.onsuccess = () => guardTransaction(tx, () => {
      const cursor = outbox.result;
      if (!cursor) return;
      counts.outbox++;
      cursor.delete();
      cursor.continue();
    });
  });
}
