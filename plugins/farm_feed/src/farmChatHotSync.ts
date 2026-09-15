/**
 * Pack side of the Freenet farm-chat bridge — live 5, day buffer, archive index.
 */
import {
  mergeFarmChatArchiveIndex,
  readFarmChatArchiveIndex,
  readFarmChatDay,
  writeFarmChatArchiveIndex,
  writeFarmChatDay,
} from './farmChatDay';
import {
  FARM_CHAT_LIVE_CAP,
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
  const merged = mergeFarmChatLogs(listFarmChat(farmId), payload.messages, FARM_CHAT_LIVE_CAP);
  writeFarmChatLocal(farmId, merged);
  if (payload.dayDate) {
    writeFarmChatDay(farmId, { date: payload.dayDate, messages: payload.dayMessages ?? [] });
  }
  if (payload.archives?.length) {
    writeFarmChatArchiveIndex(
      farmId,
      mergeFarmChatArchiveIndex(readFarmChatArchiveIndex(farmId), payload.archives)
    );
  }
  notifyFarmChatChanged(farmId);
  return merged;
}
