/**
 * Hosted farm chat — one rolling document, last 5 live lines + sealed today.
 *
 * Path: farms/{farmId}/farm_chat/log
 * Read model: getDoc / transactional write / optional onSnapshot of THIS doc only.
 * Archives: getDoc on click, never onSnapshot.
 * Plans/FIREBASE_BILLING.md · Plans/FARM_MESSAGING.md
 */
import { doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { sealHostedFarmChatDay, writeFarmChatArchiveInTx } from './farmChatArchiveHosted';
import { farmChatHostedSealKey, openFarmChatDay, sealFarmChatDay } from './farmChatArchive';
import {
  appendFarmChatDay,
  farmChatCalendarDate,
  farmChatDayRolled,
  parseFarmChatArchiveIndex,
  type FarmChatDayBuffer,
} from './farmChatDay';
import { FARM_CHAT_COLLECTION, FARM_CHAT_DOC_ID } from './farmFeedFirestore';
import {
  appendFarmChat,
  FARM_CHAT_DAY_CAP,
  FARM_CHAT_LIVE_CAP,
  parseFarmChatMessages,
  type FarmChatMessage,
} from './farmChatLog';

export { FARM_CHAT_COLLECTION, FARM_CHAT_DOC_ID, farmChatDocPath } from './farmFeedFirestore';

export function farmChatDocRef(farmId: string) {
  return doc(db, 'farms', farmId, FARM_CHAT_COLLECTION, FARM_CHAT_DOC_ID);
}

async function openHostedDay(
  farmId: string,
  data: { dayDate?: unknown; dayBlob?: unknown } | undefined
): Promise<FarmChatDayBuffer | null> {
  if (!data || typeof data.dayDate !== 'string' || typeof data.dayBlob !== 'string') return null;
  try {
    const opened = await openFarmChatDay(data.dayBlob, await farmChatHostedSealKey(farmId));
    return { date: data.dayDate, messages: opened.messages };
  } catch {
    return { date: data.dayDate, messages: [] };
  }
}

export async function readFarmChatHosted(farmId: string): Promise<FarmChatMessage[]> {
  const snap = await getDoc(farmChatDocRef(farmId));
  if (!snap.exists()) return [];
  return parseFarmChatMessages(snap.data()?.messages, FARM_CHAT_LIVE_CAP);
}

export async function appendFarmChatHosted(
  farmId: string,
  message: FarmChatMessage,
  updatedBy: string
): Promise<{ messages: FarmChatMessage[]; day: FarmChatDayBuffer }> {
  const today = farmChatCalendarDate(message.at);
  const ref = farmChatDocRef(farmId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : undefined;
    const current = snap.exists() ? parseFarmChatMessages(data?.messages, FARM_CHAT_LIVE_CAP) : [];
    let day = await openHostedDay(farmId, data);
    if (day && farmChatDayRolled(day.date, today) && day.messages.length) {
      const sealed = await sealHostedFarmChatDay(farmId, day.date, day.messages);
      const indexSnap = await tx.get(doc(db, 'farms', farmId, FARM_CHAT_COLLECTION, 'archive_index'));
      const existing = parseFarmChatArchiveIndex(indexSnap.exists() ? indexSnap.data()?.dates : []);
      writeFarmChatArchiveInTx(
        tx,
        farmId,
        day.date,
        sealed.blob,
        day.messages.length,
        updatedBy,
        existing.map((row) => row.date)
      );
      day = { date: today, messages: [] };
    }
    day = appendFarmChatDay(day, message, today);
    const messages = appendFarmChat(current, message, FARM_CHAT_LIVE_CAP);
    const dayBlob = await sealFarmChatDay(day.date, day.messages, await farmChatHostedSealKey(farmId));
    tx.set(ref, {
      messages,
      dayDate: day.date,
      dayBlob,
      updatedAt: new Date().toISOString(),
      updatedBy,
    });
    return { messages, day };
  });
}

export type FarmChatHostedSnap = {
  messages: FarmChatMessage[];
  day: FarmChatDayBuffer | null;
};

/** Single-doc listen. Not a collection snapshot. Not archives. */
export function subscribeFarmChatHosted(
  farmId: string,
  onRows: (snap: FarmChatHostedSnap) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    farmChatDocRef(farmId),
    (snap) => {
      const data = snap.exists() ? snap.data() : undefined;
      const messages = snap.exists()
        ? parseFarmChatMessages(data?.messages, FARM_CHAT_LIVE_CAP)
        : [];
      void openHostedDay(farmId, data).then((day) => onRows({ messages, day }));
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  );
}

export { FARM_CHAT_DAY_CAP };
