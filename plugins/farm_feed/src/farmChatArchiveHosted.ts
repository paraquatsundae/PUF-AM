/**
 * Hosted chat archives — get-on-click, never a collection snapshot.
 * Paths: farm_chat/archive_index + farm_chat_archives/{yyyy-mm-dd}.
 * Plans/FARM_MESSAGING.md · Plans/FIREBASE_BILLING.md
 */
import { doc, getDoc, type Transaction } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import {
  farmChatArchiveContentHash,
  farmChatHostedSealKey,
  openFarmChatDay,
  sealFarmChatDay,
} from './farmChatArchive';
import {
  FARM_CHAT_ARCHIVE_COLLECTION,
  FARM_CHAT_ARCHIVE_INDEX_ID,
  FARM_CHAT_COLLECTION,
} from './farmFeedFirestore';
import { parseFarmChatArchiveIndex, type FarmChatArchiveRef } from './farmChatDay';
import type { FarmChatMessage } from './farmChatLog';

export function farmChatArchiveIndexRef(farmId: string) {
  return doc(db, 'farms', farmId, FARM_CHAT_COLLECTION, FARM_CHAT_ARCHIVE_INDEX_ID);
}

export function farmChatArchiveDocRef(farmId: string, date: string) {
  return doc(db, 'farms', farmId, FARM_CHAT_ARCHIVE_COLLECTION, date);
}

export async function readFarmChatArchiveIndexHosted(farmId: string): Promise<FarmChatArchiveRef[]> {
  const snap = await getDoc(farmChatArchiveIndexRef(farmId));
  if (!snap.exists()) return [];
  return parseFarmChatArchiveIndex(snap.data()?.dates);
}

export async function readFarmChatArchiveHosted(
  farmId: string,
  date: string
): Promise<FarmChatMessage[]> {
  const snap = await getDoc(farmChatArchiveDocRef(farmId, date));
  if (!snap.exists()) return [];
  const blob = snap.data()?.blob;
  if (typeof blob !== 'string' || !blob) return [];
  const opened = await openFarmChatDay(blob, await farmChatHostedSealKey(farmId));
  return opened.messages;
}

export async function sealHostedFarmChatDay(
  farmId: string,
  date: string,
  messages: readonly FarmChatMessage[]
): Promise<{ blob: string; contentHash: string }> {
  const blob = await sealFarmChatDay(date, messages, await farmChatHostedSealKey(farmId));
  return { blob, contentHash: farmChatArchiveContentHash(blob) };
}

export function writeFarmChatArchiveInTx(
  tx: Transaction,
  farmId: string,
  date: string,
  blob: string,
  messageCount: number,
  updatedBy: string,
  existingDates: readonly string[]
): FarmChatArchiveRef[] {
  const refs = parseFarmChatArchiveIndex([
    { date, contentHash: farmChatArchiveContentHash(blob) },
    ...existingDates.map((d) => ({ date: d, contentHash: '' })),
  ]);
  tx.set(farmChatArchiveDocRef(farmId, date), {
    date,
    blob,
    messageCount,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
  tx.set(farmChatArchiveIndexRef(farmId), {
    dates: refs.map((row) => row.date),
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
  return refs;
}
