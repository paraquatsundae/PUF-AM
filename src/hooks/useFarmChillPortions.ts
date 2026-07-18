import { useEffect, useState } from 'react';
import { fetchFarmChillPortions, type FarmChillPortions } from '../lib/chillPortions';

export type FarmChillState = {
  loading: boolean;
  error: string | null;
  data: FarmChillPortions | null;
  refresh: () => void;
};

/**
 * Seasonal chill portions for the farm viewport (nearest DPIRD anchor = blight default).
 */
export function useFarmChillPortions(lat?: number, lng?: number): FarmChillState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FarmChillPortions | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFarmChillPortions({ lat, lng });
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
  }, [lat, lng, tick]);

  return {
    loading,
    error,
    data,
    refresh: () => setTick((n) => n + 1),
  };
}
