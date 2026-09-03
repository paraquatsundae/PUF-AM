import { useCallback, useEffect, useState } from 'react';
import { WALNUT_DISTRICTS } from '../../../src/constants';
import { fetchWithTimeout } from '../../../src/lib/weatherService';
import { getKcForMonth } from './waterPlanning';

export function useWaterRecentStats(
  farmId: string | undefined,
  chartLocation: string,
  avgKc: number,
  diaryEvents: { type: string; irrigationAmount?: number; date: string }[]
) {
  const [recentStats, setRecentStats] = useState({ etcDeficit: 0, forecastRain: 0 });

  const getKc = useCallback((monthName: string) => getKcForMonth(monthName, avgKc), [avgKc]);

  useEffect(() => {
    async function calculateRealtimeMetrics() {
      if (!farmId) return;
      try {
        const selectedDistrict = WALNUT_DISTRICTS.find((d) => d.id === chartLocation) || WALNUT_DISTRICTS[0];
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        const threeDaysAhead = new Date(today);
        threeDaysAhead.setDate(today.getDate() + 3);

        const startStr = sevenDaysAgo.toISOString().split('T')[0];
        const endStr = threeDaysAhead.toISOString().split('T')[0];
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${selectedDistrict.lat}&longitude=${selectedDistrict.lng}&start_date=${startStr}&end_date=${endStr}&daily=precipitation_sum,et0_fao_evapotranspiration&timezone=auto`;

        const res = await fetchWithTimeout(url);
        const data = await res.json();

        if (data.daily?.time) {
          let totalEtc = 0;
          let totalRain = 0;
          let forecastRain = 0;
          const todayStr = today.toISOString().split('T')[0];

          data.daily.time.forEach((dateStr: string, index: number) => {
            const et0 = data.daily.et0_fao_evapotranspiration[index] || 0;
            const rain = data.daily.precipitation_sum[index] || 0;
            const monthStr = new Date(dateStr).toLocaleString('en-US', { month: 'short' });
            const etc = et0 * getKc(monthStr);

            if (dateStr <= todayStr) {
              totalEtc += etc;
              totalRain += rain;
            } else {
              forecastRain += rain;
            }
          });

          const recentIrrigation = diaryEvents
            .filter((e) => e.type === 'irrigation' && new Date(e.date) >= sevenDaysAgo && new Date(e.date) <= today)
            .reduce((sum, e) => sum + (e.irrigationAmount || 0), 0);

          setRecentStats({
            etcDeficit: Number(Math.max(0, totalEtc - (totalRain + recentIrrigation)).toFixed(1)),
            forecastRain: Number(forecastRain.toFixed(1)),
          });
        }
      } catch (error) {
        console.error('Failed to calculate realtime metrics', error);
      }
    }

    void calculateRealtimeMetrics();
  }, [chartLocation, diaryEvents, farmId, getKc]);

  return recentStats;
}
