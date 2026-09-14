/**
 * One job: derive Farm feed from stores this farm already hydrates.
 * Highlights: local IDB + watch-merge event — no new Firestore snapshot.
 * Dashboard card must not call issue/diary loaders (Dashboard already does).
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getLastDisplayName } from '../../../src/lib/deviceSession';
import { getDefaultDiaryStartDate } from '../../../src/lib/farmDiaryTypes';
import { useFarmDiaryStore } from '../../../src/lib/farmDiaryStore';
import { isFreenetFarm } from '../../../src/lib/farmPipes';
import { useFieldStore } from '../../../src/lib/fieldStore';
import {
  listLocalHighlights,
  MAP_HIGHLIGHTS_CHANGED_EVENT,
  type MapHighlightDoc,
} from '../../../src/lib/mapHighlights';
import { sessionDisplayName } from '../../../src/lib/sessionIdentity';
import {
  deriveFarmFeedItems,
  unreadForYouCount,
  type FarmFeedItem,
  type FarmFeedPerson,
} from './farmFeedDerive';
import { readFarmFeedLastSeen, writeFarmFeedLastSeen } from './farmFeedSeen';
import { useFarmFeedPack } from './useFarmFeedPack';

export function useFarmFeed(opts?: { hydrate?: boolean }): {
  active: boolean;
  items: FarmFeedItem[];
  forYou: FarmFeedItem[];
  unreadForYou: number;
  freenetPipe: boolean;
  markSeen: () => void;
} {
  const hydrate = opts?.hydrate === true;
  const active = useFarmFeedPack();
  const { user, userData } = useAuth();
  const farmId = userData?.farmId;
  const fieldIssues = useFieldStore((s) => s.issues);
  const fieldLoaded = useFieldStore((s) => s.isLoaded);
  const fieldFarmId = useFieldStore((s) => s.currentFarmId);
  const loadFieldData = useFieldStore((s) => s.loadData);
  const events = useFarmDiaryStore((s) => s.events);
  const diaryLoaded = useFarmDiaryStore((s) => s.isLoaded);
  const diaryFarmId = useFarmDiaryStore((s) => s.currentFarmId);
  const loadDiary = useFarmDiaryStore((s) => s.loadData);
  const [highlights, setHighlights] = useState<MapHighlightDoc[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrate || !farmId) return;
    if (!fieldLoaded || fieldFarmId !== farmId) loadFieldData(farmId);
  }, [hydrate, farmId, fieldLoaded, fieldFarmId, loadFieldData]);

  useEffect(() => {
    if (!hydrate || !farmId) return;
    if (!diaryLoaded || diaryFarmId !== farmId) {
      void loadDiary(farmId, getDefaultDiaryStartDate(90));
    }
  }, [hydrate, farmId, diaryLoaded, diaryFarmId, loadDiary]);

  useEffect(() => {
    if (!farmId) {
      setHighlights([]);
      setLastSeen(null);
      return;
    }
    setLastSeen(readFarmFeedLastSeen(farmId));
    let cancelled = false;
    void listLocalHighlights(farmId).then((rows) => {
      if (!cancelled) setHighlights(rows);
    });
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ farmId?: string }>).detail;
      if (detail?.farmId && detail.farmId !== farmId) return;
      void listLocalHighlights(farmId).then((rows) => {
        if (!cancelled) setHighlights(rows);
      });
    };
    window.addEventListener(MAP_HIGHLIGHTS_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(MAP_HIGHLIGHTS_CHANGED_EVENT, onChange);
    };
  }, [farmId]);

  const person: FarmFeedPerson = useMemo(
    () => ({
      uid: userData?.uid,
      names: [userData?.displayName, user?.displayName, sessionDisplayName(user, userData), getLastDisplayName()],
    }),
    [user, userData]
  );

  const items = useMemo(
    () =>
      active
        ? deriveFarmFeedItems({ issues: fieldIssues, highlights, events, person })
        : [],
    [active, fieldIssues, highlights, events, person]
  );
  const forYou = useMemo(() => items.filter((item) => item.forYou), [items]);
  const unreadForYou = useMemo(() => unreadForYouCount(items, lastSeen), [items, lastSeen]);

  const markSeen = () => {
    if (!farmId) return;
    const iso = new Date().toISOString();
    writeFarmFeedLastSeen(farmId, iso);
    setLastSeen(iso);
  };

  return {
    active,
    items,
    forYou,
    unreadForYou,
    freenetPipe: isFreenetFarm(),
    markSeen,
  };
}
