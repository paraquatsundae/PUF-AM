import { useMemo, useState } from 'react';
import { calculateDailyChill } from '../../../shared/weather/chillCalculator';
import { useMapStore } from '../../../src/lib/mapStore';

const SAMPLE = `Date,Tmax,Tmin
2026-05-01,18.2,6.4
2026-05-02,16.8,5.1
2026-05-03,15.4,4.8`;

/**
 * Standalone calculator surface — daily Tmax/Tmin → synthetic hourly → CP.
 * Same breakdown as PUFworks-chill_calculator (Day CP, Cum CP, Mean T).
 */
export function ChillCalculatorPanel() {
  const { viewport } = useMapStore();
  const [text, setText] = useState(SAMPLE);
  const [lat, setLat] = useState(() =>
    Number.isFinite(viewport.lat) ? String(viewport.lat) : '-34.0'
  );
  const computed = useMemo(() => {
    const latDeg = Number(lat);
    if (!Number.isFinite(latDeg)) {
      return { result: null, error: 'Latitude must be a number.' };
    }
    try {
      return { result: calculateDailyChill(text, latDeg), error: null as string | null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [text, lat]);
  const { result, error } = computed;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">Daily calculator</h2>
        <p className="text-xs text-slate-500 mt-1">
          Paste Date, Tmax, Tmin (CSV). Hours are synthesised from latitude, then run through the
          Dynamic Model — same engine as the standalone Chill Portion Calculator.
        </p>
      </div>
      <label className="block text-sm text-slate-700">
        Latitude
        <input
          type="number"
          step="0.01"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
        />
      </label>
      <label className="block text-sm text-slate-700">
        Daily temperatures
        <textarea
          className="mt-1 w-full min-h-[8rem] rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </label>
      {error ? (
        <p className="text-sm text-rose-700 whitespace-pre-wrap">{error}</p>
      ) : result ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Calculator total
            </div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {result.totalPortions}
              <span className="ml-1.5 text-sm font-semibold text-slate-500">CP</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {result.days.length} day{result.days.length === 1 ? '' : 's'} · {result.hours} synthetic
              hours
            </p>
          </div>
          {result.days.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Day CP</th>
                    <th className="px-3 py-2 text-right">Cum CP</th>
                    <th className="px-3 py-2 text-right">Mean T</th>
                  </tr>
                </thead>
                <tbody>
                  {result.days.map((row) => (
                    <tr key={row.date} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-mono text-slate-800">{row.date}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {row.inc.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {row.cum.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-600">
                        {row.meanT.toFixed(1)}°
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
