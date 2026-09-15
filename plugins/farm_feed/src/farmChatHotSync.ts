/**
 * Pack side of the Freenet farm-chat bridge — live 5, day buffer, archive index.
 */
import { scheduleMistHotAutoPublish } from '../../../src/mist/mistHotBridge';
import {
  farmChatHasLocalOnly,
  mergeFarmChatArchiveIndex,
  mergeFarmChatDayIncoming,
  readFarmChatArchiveIndex,
  readFarmChatDay,
  visibleFarmChat,
  writeFarmChatArchiveIndex,
  writeFarmChatDay,
} from './farmChatDay';
import {
  listFarmChat,
  mergeFarmChatLogs,
  notifyFarmChatChanged,
  writeFarmChatLocal,
  type FarmChatMessage,
} from './farmChatLog';

export type FarmChatIncomingPayload = {
  messages: FarmChatMessage[];
  dayDate?: string;
  dayMessages?: FarmChatMessage[];
  archives?: { date: string; contentHash: string; uri?: string }[];
};

export function farmChatHotPayloadForFarm(farmId: string): FarmChatIncomingPayload {
  const day = readFarmChatDay(farmId);
  return {
    messages: listFarmChat(farmId),
    ...(day ? { dayDate: day.date, dayMessages: day.messages } : {}),
    archives: readFarmChatArchiveIndex(farmId),
  };
}

export function mergeFarmChatHotIncoming(
  farmId: string,
  incoming: FarmChatMessage[] | FarmChatIncomingPayload
): FarmChatMessage[] {
  const payload = Array.isArray(incoming) ? { messages: incoming } : incoming;
  const hasChat =
    Boolean(payload.messages.length) ||
    Boolean(payload.dayDate) ||
    Boolean(payload.dayMessages?.length) ||
    Boolean(payload.archives?.length);
  if (!hasChat) return listFarmChat(farmId);

  const localLive = listFarmChat(farmId);
  const localDay = readFarmChatDay(farmId);
  const day = mergeFarmChatDayIncoming(localDay, payload.dayDate, payload.dayMessages ?? payload.messages);
  const live = visibleFarmChat(
    day ? mergeFarmChatLogs(day.messages, payload.messages) : mergeFarmChatLogs(localLive, payload.messages)
  );
  const republish = farmChatHasLocalOnly(localLive, localDay, payload.messages, payload.dayMessages);

  writeFarmChatLocal(farmId, live);
  if (day) writeFarmChatDay(farmId, day);
  if (payload.archives?.length) {
    writeFarmChatArchiveIndex(
      farmId,
      mergeFarmChatArchiveIndex(readFarmChatArchiveIndex(farmId), payload.archives)
    );
  }
  notifyFarmChatChanged(farmId);
  if (republish) scheduleMistHotAutoPublish(farmId);
  return live;
}
