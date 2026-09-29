/**
 * Flush localFarmRepo outbox to Firestore when online.
 */
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { listOutbox, putOutboxOp, removeOutboxOp, type OutboxOp } from './localFarmRepo';
import { usesCloudSyncOutbox } from './farmPipes';
import { isLocalOnlyFarmSession } from './workshopMode';
import { flushPhotoOutbox } from './flushPhotoOutbox';
import { omitIssuePhotoLocalFields } from './issuePhotoMeta';
import { withPhotosForFirestore } from './farmPhoto';
import { stripUndefinedDeep } from './stripUndefined';
import { bindFarmOutboxFlush } from './requestFarmOutboxFlush';

/**
 * Cap the recorded failure count/log noise, never discard an unacknowledged save.
 */
export const OUTBOX_MAX_ATTEMPTS = 5;

function isOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'unavailable' ||
    msg.includes('offline') ||
    msg.includes('Failed to get document because the client is offline')
  );
}

async function applyOp(op: OutboxOp): Promise<void> {
  if (op.kind === 'diary') {
    const ref = doc(db, `farms/${op.farmId}/events`, op.entityId);
    if (op.op === 'delete') {
      await deleteDoc(ref);
      return;
    }
    if (!op.payload) throw new Error('Missing diary payload');
    // Diary payloads are complete documents, including intentional field removals.
    await setDoc(ref, stripUndefinedDeep(withPhotosForFirestore({ ...op.payload })));
    return;
  }

  if (op.kind === 'issues' || op.kind === 'issues_archive') {
    const collectionName = op.kind === 'issues_archive' ? 'archived_issues' : 'issues';
    const ref = doc(db, `farms/${op.farmId}/${collectionName}`, op.entityId);
    if (op.op === 'delete') {
      await deleteDoc(ref);
      return;
    }
    if (op.payload) {
      await setDoc(
        ref,
        stripUndefinedDeep(omitIssuePhotoLocalFields({ ...op.payload })),
        { merge: true },
      );
    }
    return;
  }

  if (op.kind === 'map_highlights') {
    const ref = doc(db, `farms/${op.farmId}/mapHighlights`, op.entityId);
    if (op.op === 'delete') {
      await deleteDoc(ref);
      return;
    }
    if (op.payload) await setDoc(ref, stripUndefinedDeep(op.payload), { merge: true });
  }
}

async function drainFarmOutbox(farmId?: string): Promise<{ flushed: number; failed: number }> {
  if (isLocalOnlyFarmSession() || !usesCloudSyncOutbox()) return { flushed: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { flushed: 0, failed: 0 };
  }

  const ops = await listOutbox(farmId);
  // Oldest first
  ops.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.createdAt.localeCompare(b.createdAt));

  let flushed = 0;
  let failed = 0;
  const blockedEntities = new Set<string>();
  const blockedFarms = new Set<string>();
  for (const op of ops) {
    const entityKey = JSON.stringify([op.farmId, op.kind, op.entityId]);
    if (blockedFarms.has(op.farmId) || blockedEntities.has(entityKey)) continue;
    try {
      await applyOp(op);
      await removeOutboxOp(op.id);
      flushed += 1;
    } catch (error) {
      if (isOfflineError(error)) {
        failed += 1;
        break; // stop — likely offline again; transient failures don't count against the op
      }
      failed += 1;
      blockedEntities.add(entityKey);
      if ((error as { code?: string })?.code === 'permission-denied') blockedFarms.add(op.farmId);
      const attempts = Math.min((op.attempts ?? 0) + 1, OUTBOX_MAX_ATTEMPTS);
      if ((op.attempts ?? 0) < OUTBOX_MAX_ATTEMPTS) {
        console.warn(`[flushFarmOutbox] op failed (attempt ${attempts})`, op.id, error);
      }
      await putOutboxOp({ ...op, attempts });
    }
  }
  return { flushed, failed };
}

// One writer per origin where Web Locks are supported; always serialize this tab.
// Every wakeup gets a fresh snapshot, including saves made during an earlier drain.
let flushTail: Promise<unknown> = Promise.resolve();
export function flushFarmOutbox(farmId?: string): Promise<{ flushed: number; failed: number }> {
  const run = () => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('pufom_farm_local:flush', () => drainFarmOutbox(farmId))
    : drainFarmOutbox(farmId);
  const result = flushTail.then(run, run);
  flushTail = result.catch(() => undefined);
  return result;
}

/** Local save has already committed; cloud failure must not reject that save. */
function requestBoundFarmOutboxFlush(farmId: string): void {
  void flushFarmOutbox(farmId).catch((error) => console.warn('[flushFarmOutbox]', error));
}

bindFarmOutboxFlush(requestBoundFarmOutboxFlush);

export { requestFarmOutboxFlush } from './requestFarmOutboxFlush';

let listening = false;

/** Call once from app bootstrap — flushes on reconnect. */
export function startFarmOutboxFlushListener(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const run = () => {
    void flushFarmOutbox().catch((e) => console.warn('[flushFarmOutbox]', e));
    void flushPhotoOutbox().catch((e) => console.warn('[flushPhotoOutbox]', e));
  };
  window.addEventListener('online', run);
  // Capacitor Network if present
  void import('@capacitor/network')
    .then(({ Network }) => {
      void Network.addListener('networkStatusChange', (status) => {
        if (status.connected) run();
      });
    })
    .catch(() => undefined);
  if (navigator.onLine) run();
}
