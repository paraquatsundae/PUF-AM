import { useEffect, useState } from 'react';
import { fetchFarmChillPortions, type FarmChillPortions } from '../lib/chillPortions';

export type FarmChillState = {
  loading: boolean;
  error: string | null;
  data: FarmChillPortions | null;
  refresh: () => void;
};

/**
 * Seasonal chill portions for the farm viewport / preferred DPIRD station.
 */
export function useFarmChillPortions(
  lat?: number,
  lng?: number,
  enabled = true,
  stationCode?: string,
  stationName?: string
): FarmChillState {
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FarmChillPortions | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFarmChillPortions({
          lat,
          lng,
          stationCode: stationCode?.trim() || undefined,
          stationName: stationName?.trim() || undefined,
        });
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load chill portions');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, tick, enabled, stationCode, stationName]);

  return {
    loading,
    error,
    data,
    refresh: () => setTick((n) => n + 1),
  };
}
