import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../src/contexts/AuthContext';
import { isPackActive } from '../../../shared/farm/cropPacks';
import { TIMESERIES_DEMO_PACK_ID } from '../../../shared/farm/timeseriesDemoPackage';
import { IconChartLine, IconDatabaseOff } from '@tabler/icons-react';
import { DendrometerChart } from './DendrometerChart';
import {
  DEMO_DENDROMETER_SERIES,
  DEMO_RANGE_END,
  DEMO_RANGE_START,
} from './demoSeries';
import {
  filterDendrometerSeries,
  normalizeDendrometersByRangeMinimum,
} from './dendrometerSeries';
import { useTimeRange, type TimeRange } from './useTimeRange';

const DAY_MS = 86_400_000;

function presetRange(days: number, maximum: string): TimeRange {
  const from = new Date(`${maximum}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: maximum };
}

export function TimeSeriesDemo() {
  const { farmCropPacks } = useAuth();
  if (!isPackActive(farmCropPacks, TIMESERIES_DEMO_PACK_ID)) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Dendrometer demo</h1>
        <p className="mt-3">This pack is not active. Ask a farm admin to install or activate it in Settings → Plugins.</p>
        <Link to="/settings" className="mt-3 inline-block text-blue-700 underline">Open Settings</Link>
      </div>
    );
  }
  return <DendrometerDemoDashboard />;
}

function DendrometerDemoDashboard() {
  const { range, setRange } = useTimeRange(DEMO_RANGE_START, DEMO_RANGE_END);
  const selected = useMemo(
    () => filterDendrometerSeries(DEMO_DENDROMETER_SERIES, range.from, range.to),
    [range.from, range.to]
  );
  const normalized = useMemo(() => normalizeDendrometersByRangeMinimum(selected), [selected]);
  const dayCount = Math.round(
    (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / DAY_MS
  ) + 1;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-24 sm:p-6 lg:pb-8">
      <header className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sky-300">
              <IconChartLine size={20} />
              <span className="text-xs font-bold uppercase tracking-widest">Learning pack</span>
            </div>
            <h1 className="text-2xl font-bold sm:text-3xl">Dendrometer time series</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Two years of synthetic daily readings from two demonstration sensors. Choose a range to update both charts.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-slate-200">
            <IconDatabaseOff size={17} />
            No API or database
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              From
              <input
                type="date"
                min={DEMO_RANGE_START}
                max={range.to}
                value={range.from}
                onChange={(event) => setRange({ ...range, from: event.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
              <input
                type="date"
                min={range.from}
                max={DEMO_RANGE_END}
                value={range.to}
                onChange={(event) => setRange({ ...range, to: event.target.value })}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: '30 days', days: 30 },
              { label: '90 days', days: 90 },
              { label: '1 year', days: 365 },
            ].map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => setRange(presetRange(preset.days, DEMO_RANGE_END))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRange({ from: DEMO_RANGE_START, to: DEMO_RANGE_END })}
              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
            >
              All data
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Showing {selected.length} daily readings per sensor across {dayCount} days. The range is stored in the URL and remembered on this device.
        </p>
      </section>

      <div className="space-y-5">
        <DendrometerChart
          title="Raw diameter"
          description="Daily diameter in millimetres. Hover over the lines for exact readings."
          data={selected}
        />
        <DendrometerChart
          title="Normalized by selected-range minimum"
          description="Value − that sensor’s minimum in the selected range. Each series starts from its own minimum of 0 mm (not necessarily its first reading)."
          data={normalized}
          normalized
        />
      </div>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Demonstration data only. These readings are synthetic and are not farm records.
      </p>
    </div>
  );
}
