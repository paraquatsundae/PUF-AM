import { CloudRain, Droplets } from 'lucide-react';

export function WaterBudgetStrip({
  usedWater,
  remainingWater,
  usedPercentage,
  mlPerHaRemaining,
  etcDeficit,
  forecastRain,
}: {
  usedWater: number;
  remainingWater: number;
  usedPercentage: number;
  mlPerHaRemaining: string;
  etcDeficit: number;
  forecastRain: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Used</p>
        <p className="text-lg font-black text-sky-600 leading-none mt-0.5">
          {usedWater}
          <span className="text-[10px] font-bold text-slate-400 ml-1">ML</span>
        </p>
        <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 rounded-full" style={{ width: `${usedPercentage}%` }} />
        </div>
      </div>
      <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Remaining</p>
        <p className="text-lg font-black text-slate-900 leading-none mt-0.5">
          {remainingWater}
          <span className="text-[10px] font-bold text-slate-400 ml-1">ML</span>
        </p>
        <p className="text-[9px] text-slate-400 mt-1">{mlPerHaRemaining} ML/ha</p>
      </div>
      <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
          <Droplets className="w-3 h-3 text-sky-500" />
          ETc deficit (7d)
        </p>
        <p className="text-lg font-black text-slate-900 leading-none mt-0.5">{etcDeficit} mm</p>
      </div>
      <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
          <CloudRain className="w-3 h-3 text-blue-500" />
          Rain (3d)
        </p>
        <p className="text-lg font-black text-slate-900 leading-none mt-0.5">{forecastRain} mm</p>
      </div>
    </div>
  );
}
