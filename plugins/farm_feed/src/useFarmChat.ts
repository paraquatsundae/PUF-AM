/**
 * One job: farm-wide chat log + send. Hosted = capped doc; Freenet = local + Hot.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getLastDisplayName } from '../../../src/lib/deviceSession';
import { isDesktopShell } from '../../../src/lib/desktopBridge';
import { isNativePlatform } from '../../../src/lib/freenetRuntime';
import { isFreenetFarm, usesCloudSyncOutbox } from '../../../src/lib/farmPipes';
import { sessionDisplayName } from '../../../src/lib/sessionIdentity';
import { isWorkshopMode } from '../../../src/lib/workshopMode';
import { scheduleMistHotAutoPublish } from '../../../src/mist/mistHotBridge';
import { appendFarmChatHosted, subscribeFarmChatHosted } from './farmChatHosted';
import {
  adoptLegacyFarmChatCache,
  appendFarmChatDay,
  farmChatCalendarDate,
  readFarmChatDay,
  writeFarmChatDay,
} from './farmChatDay';
import { flushFarmChatDayIfRolled, flushPendingFarmChatArchives } from './farmChatFlush';
import {
  appendFarmChat,
  buildFarmChatMessage,
  FARM_CHAT_CHANGED_EVENT,
  FARM_CHAT_DAY_CAP,
  FARM_CHAT_TEXT_MAX,
  farmChatLooksSecret,
  listFarmChat,
  notifyFarmChatChanged,
  parseFarmChatMessages,
  writeFarmChatLocal,
  type FarmChatMessage,
} from './farmChatLog';
import { useFarmFeedPack } from './useFarmFeedPack';

export function useFarmChat(): {
  active: boolean;
  messages: FarmChatMessage[];
  sending: boolean;
  error: string | null;
  canCompose: boolean;
  hosted: boolean;
  freenet: boolean;
  canPublishFreenet: boolean;
  send: (text: string) => Promise<boolean>;
} {
  const active = useFarmFeedPack();
  const { user, userData } = useAuth();
  const farmId = userData?.farmId;
  const hosted = usesCloudSyncOutbox();
  const freenet = isFreenetFarm();
  const canCompose = userData?.role === 'admin' || userData?.role === 'farmer';
  const canPublishFreenet =
    freenet && (isDesktopShell() || isNativePlatform() || isWorkshopMode());
  const [messages, setMessages] = useState<FarmChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!farmId || !active) {
      setMessages([]);
      return;
    }
    const raw = (() => {
      try {
        const stored = localStorage.getItem(`pufam.farmChat.log.v1.${farmId}`);
        return stored ? parseFarmChatMessages(JSON.parse(stored), FARM_CHAT_DAY_CAP) : [];
      } catch {
        return listFarmChat(farmId);
      }
    })();
    if (raw.length && !readFarmChatDay(farmId)) {
      const adopted = adoptLegacyFarmChatCache(raw);
      writeFarmChatLocal(farmId, adopted.live);
      writeFarmChatDay(farmId, adopted.day);
      void flushPendingFarmChatArchives(farmId, adopted.pendingArchive, userData?.uid || 'crew');
    }
    void flushFarmChatDayIfRolled(farmId, userData?.uid || 'crew').then(() => {
      if (freenet) scheduleMistHotAutoPublish(farmId);
    });
    setMessages(listFarmChat(farmId));
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ farmId?: string }>).detail;
      if (detail?.farmId && detail.farmId !== farmId) return;
      setMessages(listFarmChat(farmId));
    };
    window.addEventListener(FARM_CHAT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FARM_CHAT_CHANGED_EVENT, onChange);
  }, [farmId, active, freenet, userData?.uid]);

  useEffect(() => {
    if (!farmId || !active || !hosted) return;
    return subscribeFarmChatHosted(
      farmId,
      (snap) => {
        writeFarmChatLocal(farmId, snap.messages);
        if (snap.day) writeFarmChatDay(farmId, snap.day);
        setMessages(snap.messages);
        setError(null);
        void flushFarmChatDayIfRolled(farmId, userData?.uid || 'crew');
      },
      () => {
        setError('Cloud farm chat needs updated Firestore rules on this project.');
      }
    );
  }, [farmId, active, hosted, userData?.uid]);

  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      if (!farmId || !canCompose) return false;
      if (freenet && !canPublishFreenet) {
        setError('Farm chat on Freenet is AppImage / APK only. Hosted web has no node.');
        return false;
      }
      if (farmChatLooksSecret(raw)) {
        setError('That text cannot go on the farm feed.');
        return false;
      }
      const authorName = farmChatAuthorFromSession(user, userData);
      const message = buildFarmChatMessage({
        text: raw,
        authorName,
        authorUid: userData?.uid,
      });
      if (!message) {
        setError(`Type a short message (up to ${FARM_CHAT_TEXT_MAX} characters).`);
        return false;
      }
      setSending(true);
      setError(null);
      try {
        await flushFarmChatDayIfRolled(farmId, userData?.uid || 'crew', Date.parse(message.at));
        const day = appendFarmChatDay(readFarmChatDay(farmId), message, farmChatCalendarDate(message.at));
        writeFarmChatDay(farmId, day);
        const local = appendFarmChat(listFarmChat(farmId), message);
        writeFarmChatLocal(farmId, local);
        setMessages(local);
        notifyFarmChatChanged(farmId);
        if (hosted) {
          const rows = await appendFarmChatHosted(farmId, message, userData?.uid || 'crew');
          writeFarmChatLocal(farmId, rows.messages);
          writeFarmChatDay(farmId, rows.day);
          setMessages(rows.messages);
        } else if (freenet) {
          scheduleMistHotAutoPublish(farmId);
        }
        return true;
      } catch (err) {
        const hint = hosted
          ? 'Cloud farm chat needs updated Firestore rules on this project.'
          : err instanceof Error
            ? err.message
            : 'Could not send.';
        setError(hint);
        return false;
      } finally {
        setSending(false);
      }
    },
    [farmId, canCompose, hosted, freenet, canPublishFreenet, user, userData]
  );

  return {
    active,
    messages,
    sending,
    error,
    canCompose,
    hosted,
    freenet,
    canPublishFreenet,
    send,
  };
}

function farmChatAuthorFromSession(
  user: { displayName?: string | null } | null | undefined,
  userData: { displayName?: string | null; uid?: string } | null | undefined
): string {
  return sessionDisplayName(user, userData) || getLastDisplayName() || 'Crew';
}
