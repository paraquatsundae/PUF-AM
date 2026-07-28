/**
 * Flush localFarmRepo outbox to Firestore when online.
 */
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { listOutbox, removeOutboxOp, type OutboxOp } from './localFarmRepo';
import { isLocalOnlyFarmSession } from './workshopMode';
import { flushPhotoOutbox } from './flushPhotoOutbox';

function isPermissionOrOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'permission-denied' ||
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
    if (op.payload) await setDoc(ref, op.payload, { merge: true });
    return;
  }

  if (op.kind === 'issues' || op.kind === 'issues_archive') {
    const collectionName = op.kind === 'issues_archive' ? 'archived_issues' : 'issues';
    const ref = doc(db, `farms/${op.farmId}/${collectionName}`, op.entityId);
    if (op.op === 'delete') {
      await deleteDoc(ref);
      return;
    }
    if (op.payload) await setDoc(ref, op.payload, { merge: true });
  }
}

export async function flushFarmOutbox(farmId?: string): Promise<{ flushed: number; failed: number }> {
  if (isLocalOnlyFarmSession()) return { flushed: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { flushed: 0, failed: 0 };
  }

  const ops = await listOutbox(farmId);
  // Oldest first
  ops.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let flushed = 0;
  let failed = 0;
  for (const op of ops) {
    try {
      await applyOp(op);
      await removeOutboxOp(op.id);
      flushed += 1;
    } catch (error) {
      if (isPermissionOrOfflineError(error)) {
        failed += 1;
        break; // stop — likely offline again
      }
      console.warn('[flushFarmOutbox] op failed', op.id, error);
      failed += 1;
    }
  }
  return { flushed, failed };
}

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
