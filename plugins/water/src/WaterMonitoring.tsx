import { useMemo, useState } from 'react';
import { useFarmDiary } from '../../../src/lib/farmDiary';
import { useMapStore } from '../../../src/lib/mapStore';
import { useAuth } from '../../../src/contexts/AuthContext';
import { SEASONS } from '../../../src/constants';
import { WaterAllocationPanel } from './WaterAllocationPanel';
import { WaterBudgetStrip } from './WaterBudgetStrip';
import { LogIrrigationPanel } from './LogIrrigationPanel';
import { RecentIrrigationTable } from './RecentIrrigationTable';
import { WaterSeasonPlanner } from './WaterSeasonPlanner';
import { useWaterRecentStats } from './useWaterRecentStats';
import {
  actualIrrigationByMonth,
  avgKcFromBlocks,
  irrigationStyleLabel,
  usedWaterMl,
} from './waterPlanning';

export function WaterMonitoring() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;
  const [showPlanner, setShowPlanner] = useState(false);
  const [chartLocation, setChartLocation] = useState('manjimup');
  const [selectedSeason, setSelectedSeason] = useState(SEASONS[0]);

  const { events: diaryEvents, addEvent, settings } = useFarmDiary();
  const { blocks, totalAreaHa } = useMapStore();

  const farmSize = totalAreaHa > 0 ? Number(totalAreaHa.toFixed(2)) : 0;
  const allocation = typeof settings.waterAllocationMl === 'number' ? settings.waterAllocationMl : 0;
  const seasonStartYear = parseInt(selectedSeason.split('-')[0], 10);
  const avgKc = useMemo(() => avgKcFromBlocks(blocks), [blocks]);
  const appliedByMonth = useMemo(
    () => actualIrrigationByMonth(diaryEvents, seasonStartYear),
    [diaryEvents, seasonStartYear]
  );
  const usedWater = useMemo(() => usedWaterMl(appliedByMonth, farmSize), [appliedByMonth, farmSize]);
  const remainingWater = Math.max(0, allocation - usedWater);
  const mlPerHaRemaining = farmSize > 0 ? (remainingWater / farmSize).toFixed(2) : '0.00';
  const usedPercentage = allocation > 0 ? Math.min(100, (usedWater / allocation) * 100) : 0;
  const recentStats = useWaterRecentStats(farmId, chartLocation, avgKc, diaryEvents);
  const recentIrrigation = useMemo(
    () => diaryEvents.filter((e) => e.type === 'irrigation').slice(0, 8),
    [diaryEvents]
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 pb-24 lg:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Water</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Log irrigation and track seasonal use. Allocation and method are on this page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPlanner((v) => !v)}
          className="text-[11px] font-medium text-slate-500 hover:text-slate-800 self-start sm:self-auto"
        >
          {showPlanner ? 'Hide season planner' : 'Season planner'}
        </button>
      </div>

      <WaterBudgetStrip
        usedWater={usedWater}
        remainingWater={remainingWater}
        usedPercentage={usedPercentage}
        mlPerHaRemaining={mlPerHaRemaining}
        etcDeficit={recentStats.etcDeficit}
        forecastRain={recentStats.forecastRain}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Mapped area:{' '}
          <strong className="text-slate-800">{farmSize > 0 ? `${farmSize} ha` : '—'}</strong>
        </span>
        <span>
          Allocation:{' '}
          <strong className="text-slate-800">{allocation > 0 ? `${allocation} ML` : 'not set'}</strong>
        </span>
        <span>
          Method: <strong className="text-slate-800">{irrigationStyleLabel(settings.irrigationSystemType)}</strong>
        </span>
      </div>

      <WaterAllocationPanel />

      <LogIrrigationPanel
        blocks={blocks}
        irrigationSystemType={settings.irrigationSystemType}
        etcDeficit={recentStats.etcDeficit}
        onLog={addEvent}
      />

      <RecentIrrigationTable events={recentIrrigation} />

      {showPlanner && (
        <WaterSeasonPlanner
          farmSize={farmSize}
          allocation={allocation}
          appliedByMonth={appliedByMonth}
          avgKc={avgKc}
          chartLocation={chartLocation}
          onChartLocation={setChartLocation}
          selectedSeason={selectedSeason}
          onSelectedSeason={setSelectedSeason}
        />
      )}
    </div>
  );
}
