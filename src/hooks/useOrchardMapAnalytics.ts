import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { blockCentersFromGeojson } from '../lib/farmMapHit';
import {
  computeBlockAnalytics,
  type BlockAnalyticsRow,
  type BlockEnvironmentalData,
  type BlockHarvestRow,
} from '../lib/mapBlockAnalytics';
import type { OrchardBlock } from '../lib/mapStore';
import { fetchEnvironmentalData } from '../lib/weatherService';
import { isLocalOnlyFarmSession } from '../lib/workshopMode';
import type { MapMode, MapSubTab } from '../components/map/editMapTypes';

/**
 * Generic over the event row so `dailyEvents` comes back as whatever was passed
 * in. This hook only reads `date`, but its output is handed to the marker
 * cluster, which needs the whole row — pinning the parameter to `{ date }` threw
 * the rest of the shape away on the way through.
 */
export function useOrchardMapAnalytics<EventRow extends { date: string }>({
  farmId,
  mapMode,
  activeTab,
  blocks,
  viewport,
  events,
  getSprayEvents,
}: {
  farmId: string | undefined;
  mapMode: MapMode;
  activeTab: MapSubTab;
  blocks: OrchardBlock[];
  viewport: { lat: number; lng: number };
  events: EventRow[];
  getSprayEvents: (blockId?: string) => Record<string, unknown>;
}) {
  const [environmentalData, setEnvironmentalData] = useState<BlockEnvironmentalData>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [harvests, setHarvests] = useState<BlockHarvestRow[]>([]);
  const [analyticsView, setAnalyticsView] = useState<'risk' | 'yield'>('risk');

  useEffect(() => {
    if (!farmId) return;
    if (isLocalOnlyFarmSession()) {
      setHarvests([]);
      return;
    }
    const fetchHarvests = async () => {
      try {
        const q = query(collection(db, 'farms', farmId, 'harvests'), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        setHarvests(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as unknown as BlockHarvestRow)
        );
      } catch (error) {
        console.error('Error fetching harvests:', error);
      }
    };
    fetchHarvests();
  }, [farmId]);

  useEffect(() => {
    if (mapMode === 'edit' && activeTab === 'analytics' && !environmentalData && !isWeatherLoading && farmId) {
      setIsWeatherLoading(true);
      const start = new Date();
      start.setDate(start.getDate() - 14);
      const end = new Date();
      end.setDate(end.getDate() + 14);

      fetchEnvironmentalData(
        farmId || '',
        'DPIRD',
        start,
        end,
        viewport.lat,
        viewport.lng
      )
        .then((data) => {
          setEnvironmentalData(data);
          setIsWeatherLoading(false);
        })
        .catch((err) => {
          console.error('Failed to fetch environmental data', err);
          setIsWeatherLoading(false);
        });
    }
  }, [mapMode, activeTab, environmentalData, isWeatherLoading, viewport.lat, viewport.lng, farmId]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const targetDate = today;
  const targetYear = targetDate.getFullYear();
  const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
  const targetDay = String(targetDate.getDate()).padStart(2, '0');
  const targetDateStr = `${targetYear}-${targetMonth}-${targetDay}`;

  const blockCenters = useMemo(() => blockCentersFromGeojson(blocks), [blocks]);

  const dailyEvents = useMemo(
    () => events.filter((e) => e.date === targetDateStr),
    [events, targetDateStr]
  );

  const blockSprayEventsCache = useMemo(() => {
    const cache: Record<string, Record<string, unknown> | undefined> = {};
    for (const block of blocks) {
      cache[block.id] = getSprayEvents(block.id);
    }
    return cache;
  }, [blocks, getSprayEvents]);

  const blockAnalytics = useMemo(
    (): Record<string, BlockAnalyticsRow> =>
      computeBlockAnalytics({
        blocks,
        harvests,
        environmentalData,
        blockSprayEventsCache,
        targetDate,
        targetDateStr,
      }),
    [blocks, harvests, environmentalData, blockSprayEventsCache, targetDateStr, targetDate]
  );

  return {
    harvests,
    analyticsView,
    setAnalyticsView,
    blockCenters,
    dailyEvents,
    blockAnalytics,
  };
}
