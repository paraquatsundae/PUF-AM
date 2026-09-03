import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { WALNUT_DISTRICTS } from '../../../src/constants';
import { cn } from '../../../src/lib/utils';
import {
  calendarMonthLabelsForStage,
  growthStageFromDate,
  growthStageLabel,
  type GrowthStage,
} from './blightModel';
import type { WeatherSource } from '../../../src/lib/weatherService';
import type { CalibrationParams, OrchardInoculumLevel } from './modelParameters';
import { BlightOrchardInoculumPanel } from './BlightOrchardInoculumPanel';
import { BlightEngineSciencePanel } from './BlightEngineScience';

export type BlightStation = {
  stationCode?: string;
  code?: string;
  stationName: string;
  distToFarm: number;
};

export function BlightPageHeader({
  lastCalculated,
  calculating,
  isOverLimit,
  onRefresh,
  selectedBlockId,
  setSelectedBlockId,
  blocks,
  activeTab,
  growthStage,
  setGrowthStage,
  scoutingStage,
  setScoutingStage,
  todayDate,
  weatherSource,
  setWeatherSource,
  locationId,
  setLocationId,
  isFetchingStations,
  processedStations,
  weatherMeta,
  farmId,
  calib,
  setCalib,
  isAdmin,
}: {
  lastCalculated: Date | null;
  calculating: boolean;
  isOverLimit: boolean;
  onRefresh: () => void;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  blocks: { id: string; name?: string }[];
  activeTab: 'forecast' | 'historical' | 'sandbox';
  growthStage: GrowthStage;
  setGrowthStage: (s: GrowthStage) => void;
  scoutingStage: GrowthStage | null;
  setScoutingStage: (s: GrowthStage | null) => void;
  todayDate: Date;
  weatherSource: WeatherSource;
  setWeatherSource: (s: WeatherSource) => void;
  locationId: string;
  setLocationId: (id: string) => void;
  isFetchingStations: boolean;
  processedStations: BlightStation[];
  weatherMeta: { lastUpdated?: string; isStale?: boolean } | null;
  farmId: string | undefined;
  calib: CalibrationParams;
  setCalib: React.Dispatch<React.SetStateAction<CalibrationParams>>;
  isAdmin: boolean;
}) {
  const handleCalculate = onRefresh;
  return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Blight risk</h1>
            <p className="text-sm text-slate-500 mt-1">
              Ji et al. 2025 infection risk — spray efficacy is sandbox what-if only.
              {lastCalculated ? ` · Updated ${lastCalculated.toLocaleTimeString()}` : ''}
            </p>
          </div>
          <button 
            onClick={handleCalculate}
            disabled={calculating || isOverLimit}
            className="flex items-center justify-center self-start px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all text-xs font-semibold disabled:opacity-50"
          >
            {calculating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Refresh
          </button>
        </div>

        {/* Block + infrequently changed model inputs */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Block</span>
            <select 
              value={selectedBlockId || ''} 
              onChange={(e) => setSelectedBlockId(e.target.value || null)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[120px]"
            >
              <option value="">All blocks</option>
              {blocks.map(block => (
                <option key={block.id} value={block.id}>{block.name || `Block ${block.id.slice(0,4)}`}</option>
              ))}
            </select>
          </label>

          {activeTab === 'sandbox' ? (
            <label className="flex flex-col gap-0.5 min-w-0">
              <span
                className="text-[9px] font-bold text-slate-400 uppercase tracking-wide"
                title="Locks every sandbox day to this stage (what-if). Forecast/Historical use the SH calendar."
              >
                Growth stage (sandbox)
              </span>
              <select
                value={growthStage}
                onChange={(e) => setGrowthStage(e.target.value as GrowthStage)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[140px] max-w-[200px]"
              >
                <option value="dormant">Dormant</option>
                <option value="bud_break">Bud break</option>
                <option value="bloom">Bloom</option>
                <option value="post_bloom">Post-bloom</option>
                <option value="shell_hardening">Shell hardening</option>
              </select>
            </label>
          ) : (
            <>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-[9px] font-bold text-slate-400 uppercase tracking-wide"
                  title="Coarse WA / SH month schedule — not scouting-confirmed"
                >
                  Calendar stage
                </span>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 min-w-[140px]">
                  {growthStageLabel(growthStageFromDate(todayDate))}
                  <span className="text-slate-400 font-normal">
                    {' '}· {calendarMonthLabelsForStage(growthStageFromDate(todayDate))}
                  </span>
                </div>
              </div>
              <label className="flex flex-col gap-0.5 min-w-0">
                <span
                  className="text-[9px] font-bold text-slate-400 uppercase tracking-wide"
                  title="Optional: from today forward only. Past Historical days stay on the calendar. Not saved yet."
                >
                  Scouted override
                </span>
                <select
                  value={scoutingStage ?? ''}
                  onChange={(e) =>
                    setScoutingStage(e.target.value ? (e.target.value as GrowthStage) : null)
                  }
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[140px] max-w-[200px]"
                >
                  <option value="">Calendar only</option>
                  <option value="dormant">Dormant</option>
                  <option value="bud_break">Bud break</option>
                  <option value="bloom">Bloom</option>
                  <option value="post_bloom">Post-bloom</option>
                  <option value="shell_hardening">Shell hardening</option>
                </select>
              </label>
            </>
          )}

          <label className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Weather</span>
            <select 
              value={weatherSource}
              onChange={(e) => setWeatherSource(e.target.value as WeatherSource)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="DPIRD">DPIRD</option>
              <option value="Manual">Manual</option>
            </select>
          </label>

          <label className="flex flex-col gap-0.5 min-w-0 flex-1 sm:flex-none">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Station</span>
            <select 
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-400 min-w-[140px] max-w-[240px]"
              disabled={weatherSource === 'DPIRD' && isFetchingStations}
            >
              {weatherSource === 'DPIRD' ? (
                isFetchingStations ? (
                  <option value="">Loading…</option>
                ) : processedStations.length > 0 ? (
                  <>
                    <optgroup label="Closest">
                      <option value={processedStations[0].stationCode || processedStations[0].code}>
                        {processedStations[0].stationName} ({Math.round(processedStations[0].distToFarm)}km)
                      </option>
                    </optgroup>
                    {processedStations.length > 1 && (
                      <optgroup label="Nearby">
                        {processedStations.slice(1).map(s => (
                          <option key={s.stationCode || s.code} value={s.stationCode || s.code}>
                            {s.stationName} ({Math.round(s.distToFarm)}km)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  <option value="">No stations</option>
                )
              ) : (
                WALNUT_DISTRICTS.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))
              )}
            </select>
          </label>

          {weatherMeta?.lastUpdated && (
            <span className={cn(
              "text-[10px] pb-1.5",
              weatherMeta.isStale ? "text-amber-600" : "text-slate-400"
            )}>
              Cache {new Date(weatherMeta.lastUpdated).toLocaleDateString()}
              {weatherMeta.isStale ? ' · stale' : ''}
            </span>
          )}
        </div>

        <BlightOrchardInoculumPanel
          farmId={farmId}
          level={(calib.orchardInoculumLevel ?? 'medium') as OrchardInoculumLevel}
          canEdit={Boolean(isAdmin && farmId)}
          onLevelChange={(next) => setCalib((prev) => ({ ...prev, orchardInoculumLevel: next }))}
        />

        <BlightEngineSciencePanel />
      </div>
  );
}
