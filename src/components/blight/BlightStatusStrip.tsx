import React from 'react';
import { AlertTriangle, CloudRain, ShieldCheck, ThermometerSun } from 'lucide-react';
import { cn } from '../../lib/utils';
import { RISK_BAND_LABEL, type RiskBand } from '../../lib/jiBlightBands';

export function BlightStatusStrip({
  todayBand,
  currentRisk,
  forecastData,
  isProtected,
  lastSprayDate,
  isLoadingWeather,
  currentWeather,
}: {
  todayBand: RiskBand;
  currentRisk: number;
  forecastData: { dateStr: string; R: number }[];
  isProtected: boolean;
  lastSprayDate: string;
  isLoadingWeather: boolean;
  currentWeather: { T: number; RH: number; R: number; WD: number };
}) {
  return (
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
            Today
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={cn(
              "text-lg font-black tracking-tight leading-none",
              todayBand === 'action' ? "text-rose-600" : todayBand === 'watch' ? "text-amber-600" : "text-emerald-600"
            )}>
              {RISK_BAND_LABEL[todayBand]}
            </span>
            <span className="text-[9px] font-medium text-slate-400 truncate tabular-nums">
              {currentRisk.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <CloudRain className="w-3 h-3 text-blue-500 shrink-0" />
            Next rain
          </div>
          <p className="text-lg font-black tracking-tight text-slate-900 leading-none mt-0.5 truncate">
            {forecastData.find(d => d.R > 0.5)?.dateStr.split(',')[1]?.trim() || 'None'}
          </p>
        </div>

        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
            Last spray
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5 min-w-0">
            <span className={cn(
              "text-lg font-black tracking-tight leading-none",
              isProtected ? "text-emerald-600" : "text-slate-700"
            )}>
              {lastSprayDate === 'N/A' ? 'None' : (isProtected ? '≤14d' : 'Older')}
            </span>
            <span className="text-[9px] font-medium text-slate-400 truncate">
              {lastSprayDate === 'N/A' ? 'diary only' : `${lastSprayDate} · not modelled`}
            </span>
          </div>
        </div>

        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">
            <ThermometerSun className="w-3 h-3 text-amber-500 shrink-0" />
            Weather
          </div>
          <div className={cn(
            "flex items-baseline gap-2 mt-0.5 text-sm font-black text-slate-900 leading-none tabular-nums",
            isLoadingWeather && "opacity-40"
          )}>
            <span>{isLoadingWeather ? '…' : `${currentWeather.T}°`}</span>
            <span className="text-slate-500 font-bold">{isLoadingWeather ? '' : `${currentWeather.RH}%`}</span>
            <span className="text-slate-500 font-bold hidden sm:inline">{isLoadingWeather ? '' : `${currentWeather.R}mm`}</span>
            <span className="text-slate-500 font-bold hidden md:inline">{isLoadingWeather ? '' : `${currentWeather.WD}h`}</span>
          </div>
        </div>
      </div>
  );
}
