/**
 * One job: farm-admin chat archive list + download. Get-on-click, no snapshot.
 */
import { useCallback, useState } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { downloadBlob } from '../../../src/lib/farmExport';
import { isFreenetFarm, usesCloudSyncOutbox } from '../../../src/lib/farmPipes';
import { farmChatLogsVisible, formatFarmChatLogTxt } from './farmChatArchive';
import { readFarmChatArchiveHosted, readFarmChatArchiveIndexHosted } from './farmChatArchiveHosted';
import { readFarmChatArchiveHot } from './farmChatArchiveHot';
import {
  mergeFarmChatArchiveIndex,
  readFarmChatArchiveIndex,
  writeFarmChatArchiveIndex,
  type FarmChatArchiveRef,
} from './farmChatDay';
import { useFarmFeedPack } from './useFarmFeedPack';

export function useFarmChatLogs(): {
  visible: boolean;
  days: FarmChatArchiveRef[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  download: (date: string) => Promise<void>;
} {
  const active = useFarmFeedPack();
  const { userData } = useAuth();
  const visible = Boolean(active && farmChatLogsVisible(userData?.role));
  const farmId = userData?.farmId;
  const [days, setDays] = useState<FarmChatArchiveRef[]>(() =>
    farmId ? readFarmChatArchiveIndex(farmId) : []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!farmId || !visible) return;
    setLoading(true);
    setError(null);
    try {
      const remote = usesCloudSyncOutbox()
        ? await readFarmChatArchiveIndexHosted(farmId)
        : readFarmChatArchiveIndex(farmId);
      const merged = mergeFarmChatArchiveIndex(readFarmChatArchiveIndex(farmId), remote);
      writeFarmChatArchiveIndex(farmId, merged);
      setDays(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list chat logs.');
    } finally {
      setLoading(false);
    }
  }, [farmId, visible]);

  const download = useCallback(
    async (date: string) => {
      if (!farmId || !visible) return;
      setLoading(true);
      setError(null);
      try {
        const messages = usesCloudSyncOutbox()
          ? await readFarmChatArchiveHosted(farmId, date)
          : isFreenetFarm()
            ? await readFarmChatArchiveHot(
                farmId,
                days.find((row) => row.date === date) ?? { date, contentHash: '' }
              )
            : [];
        if (!messages.length) {
          setError('No archived chat for that day on this device.');
          return;
        }
        downloadBlob(
          new Blob([formatFarmChatLogTxt(date, messages)], { type: 'text/plain;charset=utf-8' }),
          `farm-chat-${date}.txt`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not download chat logs.');
      } finally {
        setLoading(false);
      }
    },
    [farmId, visible, days]
  );

  return { visible, days, loading, error, refresh, download };
}
