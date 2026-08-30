import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '../../lib/utils';
import {
  eventSeverityPhrase,
  INCUBATION_MAX_DAYS,
  INCUBATION_MIN_DAYS,
  JI_ACTION_THRESHOLD,
  JI_WATCH_THRESHOLD,
  RISK_BAND_LABEL,
  symptomWindowForEvent,
  type InfectionEvent,
  type RiskBand,
  type SevenDayOutlook,
} from '../../lib/jiBlightBands';
import { FORECAST_HORIZON_DAYS } from '../../lib/blightSeason';
import { growthStageLabel, type DailyData, type GrowthStage } from '../../lib/blightModel';

type ForecastDay = DailyData & { isForecast?: boolean; isPersistence?: boolean };
import type { WeatherSource } from '../../lib/weatherService';
import { BlightChartTooltip } from './BlightChartTooltip';

export function BlightForecastTab({
  todayBand,
  currentRisk,
  latestEvent,
  sevenDayOutlook,
  hasRealForecast,
  lastObservedDateStr,
  lastForecastDateStr,
  forecastUpdatedAt,
  calculating,
  isLoadingWeather,
  loadingParams,
  isDebouncing,
  weatherSource,
  scoutingStage,
  forecastData,
  forecastSorted,
  setWeatherSource,
  onRetryManual,
}: {
  todayBand: RiskBand;
  currentRisk: number;
  latestEvent: InfectionEvent | null;
  sevenDayOutlook: SevenDayOutlook;
  hasRealForecast: boolean;
  lastObservedDateStr: string;
  lastForecastDateStr: string;
  forecastUpdatedAt: string | undefined;
  calculating: boolean;
  isLoadingWeather: boolean;
  loadingParams: boolean;
  isDebouncing: boolean;
  weatherSource: WeatherSource;
  scoutingStage: GrowthStage | null;
  forecastData: ForecastDay[];
  forecastSorted: ForecastDay[];
  setWeatherSource: (s: WeatherSource) => void;
  onRetryManual: () => void;
}) {
  const handleCalculate = onRetryManual;
  return (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* A1 bands + A2 event + B1 seven-day outlook */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              className={cn(
                'rounded-xl border p-4 shadow-sm',
                todayBand === 'action' && 'bg-rose-50 border-rose-200',
                todayBand === 'watch' && 'bg-amber-50 border-amber-200',
                todayBand === 'quiet' && 'bg-emerald-50 border-emerald-200'
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Today</p>
              <p
                className={cn(
                  'text-2xl font-black tracking-tight',
                  todayBand === 'action' && 'text-rose-700',
                  todayBand === 'watch' && 'text-amber-700',
                  todayBand === 'quiet' && 'text-emerald-700'
                )}
              >
                {RISK_BAND_LABEL[todayBand]}
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Ji daily index {currentRisk.toFixed(3)}
                <span className="text-slate-400">
                  {' '}
                  · Quiet &lt; {JI_WATCH_THRESHOLD} · Watch · Action ≥ {JI_ACTION_THRESHOLD}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                Latest infection event
              </p>
              {latestEvent ? (
                <>
                  <p
                    className={cn(
                      'text-sm font-bold leading-snug',
                      latestEvent.band === 'action' ? 'text-rose-800' : 'text-amber-800'
                    )}
                  >
                    {eventSeverityPhrase(latestEvent.band)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {latestEvent.dayCount === 1
                      ? latestEvent.peakLabel
                      : `${latestEvent.startLabel} – ${latestEvent.endLabel}`}
                    {' · '}
                    peak {latestEvent.peakRisk.toFixed(3)} ({RISK_BAND_LABEL[latestEvent.band]})
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    Drivers: {latestEvent.R} mm rain · {latestEvent.WD} h wet (proxy) · {latestEvent.T}°C
                  </p>
                  {(() => {
                    const w = symptomWindowForEvent(latestEvent);
                    const fmt = (iso: string) =>
                      new Date(`${iso}T12:00:00`).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                      });
                    return (
                      <p className="text-[11px] text-emerald-700 mt-1.5 leading-relaxed">
                        Scout for symptoms {fmt(w.startDate)} – {fmt(w.endDate)}
                        <span className="text-slate-400"> · Ji {INCUBATION_MIN_DAYS}–{INCUBATION_MAX_DAYS}d incubation</span>
                      </p>
                    );
                  })()}
                </>
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed">
                  No Watch/Action spell in the last 21 days.
                </p>
              )}
            </div>

            <div
              className={cn(
                'rounded-xl border p-4 shadow-sm',
                sevenDayOutlook.outlookBand === 'action' && 'bg-rose-50 border-rose-200',
                sevenDayOutlook.outlookBand === 'watch' && 'bg-amber-50 border-amber-200',
                sevenDayOutlook.outlookBand === 'quiet' && 'bg-white border-slate-200'
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                Next 7 days
              </p>
              <p
                className={cn(
                  'text-2xl font-black tracking-tight',
                  sevenDayOutlook.outlookBand === 'action' && 'text-rose-700',
                  sevenDayOutlook.outlookBand === 'watch' && 'text-amber-700',
                  sevenDayOutlook.outlookBand === 'quiet' && 'text-slate-800'
                )}
              >
                {RISK_BAND_LABEL[sevenDayOutlook.outlookBand]}
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {sevenDayOutlook.actionDays > 0
                  ? `${sevenDayOutlook.actionDays} Action day${sevenDayOutlook.actionDays === 1 ? '' : 's'}${
                      sevenDayOutlook.nextAction
                        ? ` · first ${sevenDayOutlook.nextAction.dateStr}`
                        : ''
                    }`
                  : sevenDayOutlook.watchDays > 0
                    ? `${sevenDayOutlook.watchDays} Watch day${sevenDayOutlook.watchDays === 1 ? '' : 's'}${
                        sevenDayOutlook.nextWatch
                          ? ` · first ${sevenDayOutlook.nextWatch.dateStr}`
                          : ''
                      }`
                    : 'No Watch/Action days in window'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {hasRealForecast ? (
                  <>
                    Observed to {new Date(`${lastObservedDateStr}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} (DPIRD),
                    then MET Norway forecast to {new Date(`${lastForecastDateStr}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    {forecastUpdatedAt ? ` · updated ${new Date(forecastUpdatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}.
                  </>
                ) : (
                  <>
                    Persistence only: weather to {new Date(`${lastObservedDateStr}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} is observed (DPIRD),
                    then carried forward {FORECAST_HORIZON_DAYS} days. MET Norway forecast unavailable.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col relative overflow-hidden">
                {(calculating || isLoadingWeather || loadingParams || isDebouncing) && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="flex flex-col items-center text-emerald-700">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="font-medium">
                        {loadingParams ? 'Initializing…' :
                         isLoadingWeather ? `Fetching ${weatherSource} weather…` :
                         isDebouncing ? 'Waiting for input…' :
                         'Updating Ji infection risk…'}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-900">Infection risk (Ji et al. 2025)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Primary inoculum × f(T) × f(WD) from budbreak · wetness is a rain/RH proxy until sensors
                    {scoutingStage
                      ? ` · scouted ${growthStageLabel(scoutingStage)} (phenology UI only for now)`
                      : ''}. No chem/bio armour — use Sandbox for spray what-ifs.
                  </p>
                </div>
                
                <div className="w-full h-[420px]">
                  {forecastData.length === 0 && !isLoadingWeather && !loadingParams ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
                      <AlertTriangle className="w-8 h-8 text-amber-500" />
                      <p className="text-sm font-semibold text-slate-800">No forecast series yet</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Weather data did not load for the model. Try Manual under Weather, or click Refresh after the server is running.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setWeatherSource('Manual');
                          void handleCalculate();
                        }}
                        className="mt-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                      >
                        Use Manual weather &amp; retry
                      </button>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={forecastSorted} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="timestamp" 
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                        dy={10}
                        tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        domain={[0, 'auto']}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <Tooltip content={<BlightChartTooltip />} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <ReferenceLine
                        y={JI_WATCH_THRESHOLD}
                        stroke="#f59e0b"
                        strokeDasharray="3 3"
                        label={{ value: 'Watch', fill: '#d97706', fontSize: 10 }}
                      />
                      <ReferenceLine
                        y={JI_ACTION_THRESHOLD}
                        stroke="#f43f5e"
                        strokeDasharray="4 4"
                        label={{ value: 'Action', fill: '#f43f5e', fontSize: 10 }}
                      />
                      {forecastData.some((d) => d.isForecast || d.isPersistence) && (() => {
                        const lastObsTs = new Date(`${lastObservedDateStr}T12:00:00`).getTime();
                        const endTs = forecastSorted[forecastSorted.length - 1]?.timestamp;
                        if (!endTs || endTs <= lastObsTs) return null;
                        return (
                          <ReferenceLine
                            x={lastObsTs}
                            stroke="#94a3b8"
                            strokeDasharray="2 2"
                            label={{ value: hasRealForecast ? 'Forecast →' : 'Persistence →', fill: '#64748b', fontSize: 10, position: 'insideTopRight' }}
                          />
                        );
                      })()}
                      <Area
                        type="monotone"
                        dataKey="threat"
                        name="Infection risk (Ji)"
                        fill="#ef4444"
                        fillOpacity={0.8}
                        stroke="#ef4444"
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
        </div>
  );
}
