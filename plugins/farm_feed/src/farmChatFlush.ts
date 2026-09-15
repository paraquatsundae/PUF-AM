/**
 * Day-roll flush: yesterday's buffer becomes a sealed archive.
 * Hosted writes one archive doc + index (get/set, not a snapshot).
 * Freenet PUTs hot/chat-archive/{date} then the next Hot publish carries the index.
 * Plans/FARM_MESSAGING.md
 */
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../src/firebase';
import { isFreenetFarm, usesCloudSyncOutbox } from '../../../src/lib/farmPipes';
import { putFarmChatArchiveHot } from './farmChatArchiveHot';
import { sealHostedFarmChatDay, writeFarmChatArchiveInTx } from './farmChatArchiveHosted';
import {
  farmChatCalendarDate,
  farmChatDayRolled,
  mergeFarmChatArchiveIndex,
  parseFarmChatArchiveIndex,
  readFarmChatArchiveIndex,
  readFarmChatDay,
  writeFarmChatArchiveIndex,
  writeFarmChatDay,
  type FarmChatArchiveRef,
  type FarmChatDayBuffer,
} from './farmChatDay';
import { FARM_CHAT_COLLECTION } from './farmFeedFirestore';
import type { FarmChatMessage } from './farmChatLog';

export async function archiveOneFarmChatDay(
  farmId: string,
  date: string,
  messages: readonly FarmChatMessage[],
  updatedBy: string
): Promise<FarmChatArchiveRef | null> {
  if (!messages.length) return null;
  if (usesCloudSyncOutbox()) {
    const sealed = await sealHostedFarmChatDay(farmId, date, messages);
    await runTransaction(db, async (tx) => {
      const indexSnap = await tx.get(doc(db, 'farms', farmId, FARM_CHAT_COLLECTION, 'archive_index'));
      const existing = parseFarmChatArchiveIndex(indexSnap.exists() ? indexSnap.data()?.dates : []);
      writeFarmChatArchiveInTx(
        tx,
        farmId,
        date,
        sealed.blob,
        messages.length,
        updatedBy,
        existing.map((row) => row.date)
      );
    });
    const ref = { date, contentHash: sealed.contentHash };
    writeFarmChatArchiveIndex(farmId, mergeFarmChatArchiveIndex(readFarmChatArchiveIndex(farmId), [ref]));
    return ref;
  }
  if (isFreenetFarm()) {
    const ref = await putFarmChatArchiveHot(farmId, date, messages);
    if (ref) {
      writeFarmChatArchiveIndex(farmId, mergeFarmChatArchiveIndex(readFarmChatArchiveIndex(farmId), [ref]));
    }
    return ref;
  }
  const ref = { date, contentHash: '' };
  writeFarmChatArchiveIndex(farmId, mergeFarmChatArchiveIndex(readFarmChatArchiveIndex(farmId), [ref]));
  return ref;
}

export async function flushFarmChatDayIfRolled(
  farmId: string,
  updatedBy: string,
  now = Date.now()
): Promise<FarmChatDayBuffer | null> {
  const today = farmChatCalendarDate(now);
  const day = readFarmChatDay(farmId);
  if (!day || !farmChatDayRolled(day.date, today)) return day;
  await archiveOneFarmChatDay(farmId, day.date, day.messages, updatedBy);
  const next = { date: today, messages: [] as FarmChatMessage[] };
  writeFarmChatDay(farmId, next);
  return next;
}

export async function flushPendingFarmChatArchives(
  farmId: string,
  pending: Map<string, FarmChatMessage[]>,
  updatedBy: string
): Promise<void> {
  for (const [date, messages] of pending) {
    await archiveOneFarmChatDay(farmId, date, messages, updatedBy);
  }
}
