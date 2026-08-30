import React, { useEffect, useState } from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart3, CheckCircle2, Copy, Edit2, Info, Loader2, Plus, Target, Trash2, Wand2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WALNUT_DISTRICTS, SEASONS } from '../../constants';
import { fetchWithTimeout } from '../../lib/weatherService';
import {
  WATER_SEASON_MONTHS as MONTHS,
  autoDistributePlan,
  buildSeasonChartRows,
  createWaterScenario,
  displayToMm,
  etcCoveragePercent,
  mmToDisplay,
  planTotals,
  type WaterScenario as Scenario,
} from '../../lib/waterPlanning';
import { WATER_FIELD_CLASS } from './waterFieldClass';

export function WaterSeasonPlanner({
  farmSize,
  allocation,
  appliedByMonth,
  avgKc,
  chartLocation,
  onChartLocation,
  selectedSeason,
  onSelectedSeason,
}: {
  farmSize: number;
  allocation: number;
  appliedByMonth: Record<string, number>;
  avgKc: number;
  chartLocation: string;
  onChartLocation: (id: string) => void;
  selectedSeason: string;
  onSelectedSeason: (season: string) => void;
}) {
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [rainfallData, setRainfallData] = useState<Record<string, number>>({});
  const [et0Data, setEt0Data] = useState<Record<string, number>>({});
  const [scenarios, setScenarios] = useState<Record<string, Scenario>>({
    baseline: createWaterScenario('baseline', 'Baseline plan'),
  });
  const [activeScenarioId, setActiveScenarioId] = useState('baseline');
  const [comparisonScenarioId, setComparisonScenarioId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [irrigationUnit, setIrrigationUnit] = useState<'mm' | 'ML'>('mm');

  const seasonStartYear = parseInt(selectedSeason.split('-')[0], 10);
  const activeScenario = scenarios[activeScenarioId] || scenarios.baseline;
  const comparisonScenario = comparisonScenarioId ? scenarios[comparisonScenarioId] : null;
  const chartData = buildSeasonChartRows(
    rainfallData,
    et0Data,
    appliedByMonth,
    activeScenario.data,
    comparisonScenario?.data ?? null,
    avgKc
  );
  const totalEtc = chartData.reduce((sum, d) => sum + (d.etc || 0), 0);
  const { totalMm: activeTotalMm, totalMl: activeTotalML } = planTotals(activeScenario.data, farmSize);
  const matchScore = etcCoveragePercent(activeTotalMm, totalEtc);

  useEffect(() => {
    async function fetchHistoricalRainfall() {
      setIsLoadingChart(true);
      try {
        const selectedDistrict = WALNUT_DISTRICTS.find((d) => d.id === chartLocation) || WALNUT_DISTRICTS[0];
        const start = `${seasonStartYear}-07-01`;
        const seasonEnd = `${seasonStartYear + 1}-06-30`;
        const today = new Date();
        const archiveEnd = new Date(today);
        archiveEnd.setDate(today.getDate() - 2);
        const archiveEndStr = archiveEnd.toISOString().split('T')[0];
        const end = seasonEnd > archiveEndStr ? archiveEndStr : seasonEnd;

        if (start > end) {
          setRainfallData(Object.fromEntries(MONTHS.map((m) => [m, 0])));
          setEt0Data(Object.fromEntries(MONTHS.map((m) => [m, 0])));
          setIsLoadingChart(false);
          return;
        }

        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${selectedDistrict.lat}&longitude=${selectedDistrict.lng}&start_date=${start}&end_date=${end}&daily=precipitation_sum,et0_fao_evapotranspiration&timezone=auto`;
        const res = await fetchWithTimeout(url);
        const data = await res.json();

        const monthlyRainfall: Record<string, number> = Object.fromEntries(MONTHS.map((m) => [m, 0]));
        const monthlyEt0: Record<string, number> = Object.fromEntries(MONTHS.map((m) => [m, 0]));

        if (data.daily?.time) {
          data.daily.time.forEach((dateStr: string, index: number) => {
            const monthStr = new Date(dateStr).toLocaleString('en-US', { month: 'short' });
            if (monthlyRainfall[monthStr] !== undefined) {
              monthlyRainfall[monthStr] += data.daily.precipitation_sum?.[index] || 0;
              monthlyEt0[monthStr] += data.daily.et0_fao_evapotranspiration?.[index] || 0;
            }
          });
        }

        setRainfallData(monthlyRainfall);
        setEt0Data(monthlyEt0);
      } catch (error) {
        console.error('Failed to fetch historical rainfall', error);
      } finally {
        setIsLoadingChart(false);
      }
    }

    void fetchHistoricalRainfall();
  }, [chartLocation, selectedSeason, seasonStartYear]);

  const handleIrrigationInputChange = (month: string, value: string) => {
    const mmValue = displayToMm(Number(value) || 0, irrigationUnit, farmSize);
    setScenarios((prev) => ({
      ...prev,
      [activeScenarioId]: {
        ...prev[activeScenarioId],
        data: { ...prev[activeScenarioId].data, [month]: mmValue },
      },
    }));
  };

  const handleCreateScenario = () => {
    const id = `scenario-${Date.now()}`;
    setScenarios((prev) => ({
      ...prev,
      [id]: createWaterScenario(id, `Plan ${Object.keys(prev).length + 1}`),
    }));
    setActiveScenarioId(id);
  };

  const handleCloneScenario = () => {
    const id = `scenario-${Date.now()}`;
    setScenarios((prev) => ({
      ...prev,
      [id]: { ...prev[activeScenarioId], id, name: `${prev[activeScenarioId].name} (copy)` },
    }));
    setActiveScenarioId(id);
  };

  const handleRenameScenario = () => {
    if (!renameValue.trim()) return;
    setScenarios((prev) => ({
      ...prev,
      [activeScenarioId]: { ...prev[activeScenarioId], name: renameValue.trim() },
    }));
    setIsRenaming(false);
  };

  const handleDeleteScenario = () => {
    if (activeScenarioId === 'baseline') return;
    const next = { ...scenarios };
    delete next[activeScenarioId];
    setScenarios(next);
    setActiveScenarioId('baseline');
  };

  const handleAutoDistribute = () => {
    const newData = autoDistributePlan(activeScenario.budgetGoal, rainfallData, et0Data, avgKc);
    setScenarios((prev) => ({
      ...prev,
      [activeScenarioId]: { ...prev[activeScenarioId], data: newData },
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{selectedSeason} season planner</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Workshop tool — plans stay in this session (not saved to the farm).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={chartLocation}
            onChange={(e) => onChartLocation(e.target.value)}
            className={WATER_FIELD_CLASS}
          >
            {WALNUT_DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={selectedSeason}
            onChange={(e) => onSelectedSeason(e.target.value)}
            className={WATER_FIELD_CLASS}
          >
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Plan
            </span>
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setRenameValue(activeScenario.name);
                  setIsRenaming(true);
                }}
                className="p-1 hover:bg-slate-200 rounded text-slate-500"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleDeleteScenario}
                disabled={activeScenarioId === 'baseline'}
                className="p-1 hover:bg-red-100 hover:text-red-600 rounded text-slate-500 disabled:opacity-30"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          {isRenaming ? (
            <div className="flex gap-1 mb-2">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className={cn(WATER_FIELD_CLASS, 'flex-1')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameScenario();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
              />
              <button type="button" onClick={handleRenameScenario} className="p-1.5 bg-sky-600 text-white rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setIsRenaming(false)} className="p-1.5 bg-slate-200 rounded-lg">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <select
              value={activeScenarioId}
              onChange={(e) => setActiveScenarioId(e.target.value)}
              className={cn(WATER_FIELD_CLASS, 'w-full mb-2')}
            >
              {(Object.values(scenarios) as Scenario[]).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleCreateScenario}
              className="flex-1 py-1 text-[10px] font-medium bg-white border border-slate-200 rounded-md"
            >
              <Plus className="w-3 h-3 inline mr-0.5" /> New
            </button>
            <button
              type="button"
              onClick={handleCloneScenario}
              className="flex-1 py-1 text-[10px] font-medium bg-white border border-slate-200 rounded-md"
            >
              <Copy className="w-3 h-3 inline mr-0.5" /> Clone
            </button>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1 mb-1">
            <Target className="w-3 h-3" /> ETc coverage
          </p>
          <p className="text-2xl font-black text-slate-900">{matchScore}%</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Plan total</p>
          <p className="text-2xl font-black text-slate-900">
            {activeTotalML.toFixed(1)}
            <span className="text-xs font-bold text-slate-400 ml-1">ML</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {allocation > 0 ? ((activeTotalML / allocation) * 100).toFixed(0) : 0}% of allocation
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Compare</p>
          <select
            value={comparisonScenarioId || ''}
            onChange={(e) => setComparisonScenarioId(e.target.value || null)}
            className={cn(WATER_FIELD_CLASS, 'w-full')}
          >
            <option value="">None</option>
            {(Object.values(scenarios) as Scenario[])
              .filter((s) => s.id !== activeScenarioId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="h-[320px] relative">
        {isLoadingChart && (
          <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="rainfall" name="Rain (mm)" fill="#94a3b8" radius={[3, 3, 0, 0]} barSize={18} />
            <Bar
              yAxisId="left"
              dataKey="activeScenario"
              name={`${activeScenario.name} (mm)`}
              fill="#0ea5e9"
              radius={[3, 3, 0, 0]}
              barSize={18}
            />
            {comparisonScenario && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="comparisonScenario"
                name={`${comparisonScenario.name} (mm)`}
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 2 }}
              />
            )}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="recommended"
              name="ETc (mm)"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="right"
              type="stepAfter"
              dataKey="balance"
              name="Balance (mm)"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">Monthly plan inputs · {activeScenario.name}</p>
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            <button
              type="button"
              className={cn(
                'px-2 py-1 text-[10px] font-semibold rounded-md',
                irrigationUnit === 'mm' ? 'bg-white shadow-sm' : 'text-slate-500'
              )}
              onClick={() => setIrrigationUnit('mm')}
            >
              mm
            </button>
            <button
              type="button"
              className={cn(
                'px-2 py-1 text-[10px] font-semibold rounded-md',
                irrigationUnit === 'ML' ? 'bg-white shadow-sm' : 'text-slate-500'
              )}
              onClick={() => setIrrigationUnit('ML')}
            >
              ML
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Budget ML/ha</span>
            <input
              type="number"
              step="0.1"
              value={activeScenario.budgetGoal}
              onChange={(e) => {
                const val = Number(e.target.value);
                setScenarios((prev) => ({
                  ...prev,
                  [activeScenarioId]: { ...prev[activeScenarioId], budgetGoal: val },
                }));
              }}
              className={cn(WATER_FIELD_CLASS, 'w-24')}
            />
          </label>
          <button
            type="button"
            onClick={handleAutoDistribute}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 text-white rounded-lg text-[11px] font-semibold"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Auto-distribute
          </button>
          <p className="text-[11px] text-slate-500 flex items-start gap-1 max-w-md">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-500" />
            Spreads the budget by rainfall deficit. Session only — not written to the farm.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {MONTHS.map((month) => {
            const mmValue = activeScenario.data[month] || 0;
            const displayValue = mmToDisplay(mmValue, irrigationUnit, farmSize);
            return (
              <label key={month} className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase">{month}</span>
                <input
                  type="number"
                  value={displayValue === 0 ? '' : Number(displayValue.toFixed(1))}
                  onChange={(e) => handleIrrigationInputChange(month, e.target.value)}
                  className={WATER_FIELD_CLASS}
                  placeholder="0"
                />
              </label>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">
          Plan total:{' '}
          <span className="font-semibold text-slate-800">
            {irrigationUnit === 'ML' ? activeTotalML.toFixed(1) : activeTotalMm.toFixed(0)} {irrigationUnit}
          </span>
          {' · '}
          {matchScore}% of seasonal ETc
        </p>
      </div>
    </div>
  );
}
