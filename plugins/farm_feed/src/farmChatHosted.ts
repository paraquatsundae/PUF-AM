/**
 * Hosted farm chat — one rolling document, last N lines.
 *
 * Path: farms/{farmId}/farm_chat/log
 * Read model: getDoc / transactional write / optional onSnapshot of THIS doc only.
 * Cost: 1 read on attach; 1 transactional read + 1 write per Send; 1 read per
 * listener when the doc changes. Never a collection query. Never FCM.
 * BYO uses the farm's own project. No weather fallback.
 * Plans/FIREBASE_BILLING.md · Plans/FARM_MESSAGING.md
 */
import { doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { FARM_CHAT_COLLECTION, FARM_CHAT_DOC_ID } from './farmFeedFirestore';
import {
  appendFarmChat,
  parseFarmChatMessages,
  type FarmChatMessage,
} from './farmChatLog';

export { FARM_CHAT_COLLECTION, FARM_CHAT_DOC_ID, farmChatDocPath } from './farmFeedFirestore';

export function farmChatDocRef(farmId: string) {
  return doc(db, 'farms', farmId, FARM_CHAT_COLLECTION, FARM_CHAT_DOC_ID);
}

export async function readFarmChatHosted(farmId: string): Promise<FarmChatMessage[]> {
  const snap = await getDoc(farmChatDocRef(farmId));
  if (!snap.exists()) return [];
  return parseFarmChatMessages(snap.data()?.messages);
}

export async function appendFarmChatHosted(
  farmId: string,
  message: FarmChatMessage,
  updatedBy: string
): Promise<FarmChatMessage[]> {
  const ref = farmChatDocRef(farmId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? parseFarmChatMessages(snap.data()?.messages) : [];
    const messages = appendFarmChat(current, message);
    tx.set(ref, {
      messages,
      updatedAt: new Date().toISOString(),
      updatedBy,
    });
    return messages;
  });
}

/** Single-doc listen. Not a collection snapshot. */
export function subscribeFarmChatHosted(
  farmId: string,
  onRows: (rows: FarmChatMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    farmChatDocRef(farmId),
    (snap) => {
      onRows(snap.exists() ? parseFarmChatMessages(snap.data()?.messages) : []);
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  );
}
