import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useFarmDiary } from '../lib/farmDiary';
import { useMapStore } from '../lib/mapStore';
import { useAuth } from '../contexts/AuthContext';
import {
  Droplets,
  Activity,
  CheckCircle2,
  Loader2,
  Info,
  Wand2,
  Plus,
  Copy,
  Target,
  BarChart3,
  ChevronRight,
  Edit2,
  Trash2,
  X,
  CloudRain,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WALNUT_DISTRICTS, SEASONS } from '../constants';
import { fetchWithTimeout } from '../lib/weatherService';
import { WaterAllocationPanel } from '../components/water/WaterAllocationPanel';

interface Scenario {
  id: string;
  name: string;
  budgetGoal: number;
  data: Record<string, number>; // mm
}

const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function irrigationTypeToStyle(type: string): string {
  switch (type) {
    case 'surface_drip':
      return 'drip-tape';
    case 'sub_surface':
      return 'sdi';
    case 'flood':
      return 'flood';
    default:
      return 'micro-sprinkler';
  }
}

export function WaterMonitoring() {
  const { userData } = useAuth();
  const farmId = userData?.farmId;

  const [systemStyle, setSystemStyle] = useState('micro-sprinkler');
  const [outputRate, setOutputRate] = useState<number>(2.5);
  const [block, setBlock] = useState('');
  const [eventDate, setEventDate] = useState(todayIso);
  const [inputMode, setInputMode] = useState<'time' | 'depth'>('depth');
  const [runTime, setRunTime] = useState<number>(12);
  const [depth, setDepth] = useState<number>(30);
  const [fertigation, setFertigation] = useState(false);
  const [fertilizerType, setFertilizerType] = useState('UAN-32');
  const [injectionRate, setInjectionRate] = useState<number>(50);
  const [loggedFlash, setLoggedFlash] = useState(false);

  const [chartLocation, setChartLocation] = useState('manjimup');
  const [selectedSeason, setSelectedSeason] = useState(SEASONS[0]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);

  const [rainfallData, setRainfallData] = useState<Record<string, number>>({});
  const [et0Data, setEt0Data] = useState<Record<string, number>>({});

  const [scenarios, setScenarios] = useState<Record<string, Scenario>>({
    baseline: {
      id: 'baseline',
      name: 'Baseline plan',
      budgetGoal: 8.5,
      data: Object.fromEntries(MONTHS.map((m) => [m, 0])),
    },
  });
  const [activeScenarioId, setActiveScenarioId] = useState('baseline');
  const [comparisonScenarioId, setComparisonScenarioId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [irrigationUnit, setIrrigationUnit] = useState<'mm' | 'ML'>('mm');
  const [chartData, setChartData] = useState<
    {
      month: string;
      rainfall: number;
      etc: number;
      recommended: number;
      applied: number;
      activeScenario: number;
      comparisonScenario: number | null;
      totalWater: number;
      balance: number;
    }[]
  >([]);

  const seasonStartYear = parseInt(selectedSeason.split('-')[0], 10);
  const activeScenario = scenarios[activeScenarioId] || scenarios.baseline;
  const comparisonScenario = comparisonScenarioId ? scenarios[comparisonScenarioId] : null;

  const { events: diaryEvents, addEvent, settings } = useFarmDiary();
  const { blocks, totalAreaHa } = useMapStore();

  const farmSize = totalAreaHa > 0 ? Number(totalAreaHa.toFixed(2)) : 0;
  const allocation = typeof settings.waterAllocationMl === 'number' ? settings.waterAllocationMl : 0;

  useEffect(() => {
    if (!block && blocks.length > 0) {
      setBlock(blocks[0].id);
    }
  }, [blocks, block]);

  useEffect(() => {
    setSystemStyle(irrigationTypeToStyle(settings.irrigationSystemType || 'micro'));
  }, [settings.irrigationSystemType]);

  const avgKc = useMemo(() => {
    if (blocks.length === 0) return 1.0;
    const totalArea = blocks.reduce((sum, b) => sum + (b.areaHa || 0), 0) || 1;
    let weightedClosure = 0;
    blocks.forEach((b) => {
      const area = b.areaHa || totalArea / blocks.length;
      const closure = b.canopyClosure || 50;
      weightedClosure += closure * area;
    });
    const avgClosure = weightedClosure / totalArea;
    return 0.8 + (avgClosure / 100) * 0.35;
  }, [blocks]);

  const actualIrrigationByMonth = useMemo(() => {
    const actuals: Record<string, number> = {};
    MONTHS.forEach((m) => {
      actuals[m] = 0;
    });

    diaryEvents.forEach((e) => {
      if (e.type === 'irrigation' && e.irrigationAmount) {
        const date = new Date(e.date);
        const year = date.getFullYear();
        const monthIndex = date.getMonth();
        const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
          monthIndex
        ];
        const isSelectedSeason =
          (monthIndex >= 6 && year === seasonStartYear) ||
          (monthIndex < 6 && year === seasonStartYear + 1);

        if (isSelectedSeason && actuals[monthName] !== undefined) {
          actuals[monthName] += e.irrigationAmount;
        }
      }
    });
    return actuals;
  }, [diaryEvents, selectedSeason, seasonStartYear]);

  const getKc = useCallback(
    (monthName: string) => {
      const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(
        monthName
      );
      const curve = [0.95, 0.85, 0.65, 0.35, 0.15, 0.12, 0.12, 0.12, 0.12, 0.15, 0.35, 0.65];
      return curve[monthIndex] * avgKc;
    },
    [avgKc]
  );

  const [recentStats, setRecentStats] = useState({ etcDeficit: 0, forecastRain: 0 });

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

  const usedWater = useMemo(() => {
    const totalMm = (Object.values(actualIrrigationByMonth) as number[]).reduce((sum, val) => sum + val, 0);
    return Number(((totalMm * farmSize) / 100).toFixed(1));
  }, [actualIrrigationByMonth, farmSize]);

  useEffect(() => {
    if (inputMode === 'time') {
      setDepth(Number((runTime * outputRate).toFixed(1)));
    } else if (outputRate > 0) {
      setRunTime(Number((depth / outputRate).toFixed(1)));
    }
  }, [runTime, depth, outputRate, inputMode]);

  useEffect(() => {
    async function fetchHistoricalRainfall() {
      if (!showPlanner) return;
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
  }, [chartLocation, selectedSeason, seasonStartYear, showPlanner]);

  useEffect(() => {
    let cumulativeRain = 0;
    let cumulativeEtc = 0;
    let cumulativeApplied = 0;

    const newData = MONTHS.map((month) => {
      const rainfall = Math.round(rainfallData[month] || 0);
      const et0 = et0Data[month] || 0;
      const etc = Math.round(et0 * getKc(month));
      const applied = Math.round(actualIrrigationByMonth[month] || 0);
      const activeValue = activeScenario.data[month] || 0;
      const comparisonValue = comparisonScenario ? comparisonScenario.data[month] || 0 : null;

      cumulativeRain += rainfall;
      cumulativeEtc += etc;
      cumulativeApplied += applied;

      return {
        month,
        rainfall,
        etc,
        recommended: etc,
        applied,
        activeScenario: activeValue,
        comparisonScenario: comparisonValue,
        totalWater: rainfall + activeValue,
        balance: Math.round(cumulativeRain + cumulativeApplied - cumulativeEtc),
      };
    });
    setChartData(newData);
  }, [rainfallData, et0Data, actualIrrigationByMonth, activeScenario, comparisonScenario, getKc]);

  const handleIrrigationInputChange = (month: string, value: string) => {
    const numValue = Number(value) || 0;
    const mmValue = irrigationUnit === 'ML' && farmSize > 0 ? (numValue * 100) / farmSize : numValue;

    setScenarios((prev) => ({
      ...prev,
      [activeScenarioId]: {
        ...prev[activeScenarioId],
        data: {
          ...prev[activeScenarioId].data,
          [month]: mmValue,
        },
      },
    }));
  };

  const handleCreateScenario = () => {
    const id = `scenario-${Date.now()}`;
    setScenarios((prev) => ({
      ...prev,
      [id]: {
        id,
        name: `Plan ${Object.keys(prev).length + 1}`,
        budgetGoal: 8.5,
        data: Object.fromEntries(MONTHS.map((m) => [m, 0])),
      },
    }));
    setActiveScenarioId(id);
  };

  const handleCloneScenario = () => {
    const id = `scenario-${Date.now()}`;
    setScenarios((prev) => ({
      ...prev,
      [id]: {
        ...prev[activeScenarioId],
        id,
        name: `${prev[activeScenarioId].name} (copy)`,
      },
    }));
    setActiveScenarioId(id);
  };

  const handleRenameScenario = () => {
    if (!renameValue.trim()) return;
    setScenarios((prev) => ({
      ...prev,
      [activeScenarioId]: {
        ...prev[activeScenarioId],
        name: renameValue.trim(),
      },
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

  const totalEtc = chartData.reduce((sum, d) => sum + (d.etc || 0), 0);
  const activeTotalMm: number = activeScenario?.data
    ? (Object.values(activeScenario.data) as number[]).reduce((sum, val) => sum + val, 0)
    : 0;
  const matchScore = totalEtc > 0 ? Math.min(100, Math.round((activeTotalMm / totalEtc) * 100)) : 0;
  const activeTotalML: number = farmSize > 0 ? (activeTotalMm * farmSize) / 100 : 0;

  const handleAutoDistribute = () => {
    const budgetMm = activeScenario.budgetGoal * 100;
    const deficits = MONTHS.map((month) => {
      const et0 = et0Data[month] || 0;
      const etc = et0 * getKc(month);
      const rainfall = rainfallData[month] || 0;
      return { month, deficit: Math.max(0, etc - rainfall) };
    });
    const totalDeficit = deficits.reduce((sum, d) => sum + d.deficit, 0);
    const newData: Record<string, number> = {};
    deficits.forEach((d) => {
      newData[d.month] =
        totalDeficit > 0 ? Number(Math.min(d.deficit, budgetMm * (d.deficit / totalDeficit)).toFixed(1)) : 0;
    });
    setScenarios((prev) => ({
      ...prev,
      [activeScenarioId]: { ...prev[activeScenarioId], data: newData },
    }));
  };

  const handleLogIrrigation = () => {
    if (!block) {
      alert('Select a block first.');
      return;
    }
    const blockName = blocks.find((b) => b.id === block)?.name || block;
    addEvent({
      date: eventDate || todayIso(),
      type: 'irrigation',
      irrigationAmount: depth,
      durationMinutes: runTime * 60,
      notes: `Irrigated ${blockName} via ${systemStyle}.${
        fertigation ? ` Fertigation: ${injectionRate}L of ${fertilizerType}.` : ''
      }`,
    });
    setLoggedFlash(true);
    window.setTimeout(() => setLoggedFlash(false), 2000);
  };

  const remainingWater = Math.max(0, allocation - usedWater);
  const mlPerHaRemaining = farmSize > 0 ? (remainingWater / farmSize).toFixed(2) : '0.00';
  const usedPercentage = allocation > 0 ? Math.min(100, (usedWater / allocation) * 100) : 0;

  const recentIrrigation = useMemo(
    () => diaryEvents.filter((e) => e.type === 'irrigation').slice(0, 8),
    [diaryEvents]
  );

  const fieldClass =
    'bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-400';

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

      {/* Compact budget + field context */}
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
          <p className="text-lg font-black text-slate-900 leading-none mt-0.5">{recentStats.etcDeficit} mm</p>
        </div>
        <div className="bg-white px-2.5 py-2 rounded-lg border border-slate-200 min-w-0">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <CloudRain className="w-3 h-3 text-blue-500" />
            Rain (3d)
          </p>
          <p className="text-lg font-black text-slate-900 leading-none mt-0.5">{recentStats.forecastRain} mm</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Mapped area:{' '}
          <strong className="text-slate-800">{farmSize > 0 ? `${farmSize} ha` : '—'}</strong>
        </span>
        <span>
          Allocation:{' '}
          <strong className="text-slate-800">
            {allocation > 0 ? `${allocation} ML` : 'not set'}
          </strong>
        </span>
        <span className="capitalize">
          Method:{' '}
          <strong className="text-slate-800 normal-case">
            {settings.irrigationSystemType === 'micro'
              ? 'Micro-sprinkler'
              : settings.irrigationSystemType === 'surface_drip'
                ? 'Surface drip'
                : settings.irrigationSystemType === 'sub_surface'
                  ? 'SDI'
                  : settings.irrigationSystemType === 'flood'
                    ? 'Flood'
                    : 'Micro-sprinkler'}
          </strong>
        </span>
      </div>

      <WaterAllocationPanel />

      {/* Log irrigation — diary only */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Log irrigation</h2>
            <p className="text-[11px] text-slate-500">Writes to Farm Diary — no pump control</p>
          </div>
          <Link to="/diary" className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1">
            Diary <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Block</span>
            <select className={fieldClass} value={block} onChange={(e) => setBlock(e.target.value)}>
              {blocks.length === 0 && <option value="">No blocks mapped</option>}
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Date</span>
            <input
              type="date"
              className={fieldClass}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">System</span>
            <select className={fieldClass} value={systemStyle} onChange={(e) => setSystemStyle(e.target.value)}>
              <option value="micro-sprinkler">Micro-sprinkler</option>
              <option value="drip-tape">Drip</option>
              <option value="sdi">SDI</option>
              <option value="flood">Flood</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Rate mm/hr</span>
            <input
              type="number"
              step="0.1"
              className={fieldClass}
              value={outputRate}
              onChange={(e) => setOutputRate(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 text-[10px] font-semibold rounded-md',
                inputMode === 'depth' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
              onClick={() => setInputMode('depth')}
            >
              Depth
            </button>
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 text-[10px] font-semibold rounded-md',
                inputMode === 'time' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
              onClick={() => setInputMode('time')}
            >
              Hours
            </button>
          </div>
          {inputMode === 'depth' ? (
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Depth</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className={cn(fieldClass, 'w-24')}
                  value={depth}
                  onChange={(e) => {
                    setInputMode('depth');
                    setDepth(Number(e.target.value));
                  }}
                />
                <span className="text-[10px] text-slate-400">mm · ~{runTime}h</span>
              </div>
            </label>
          ) : (
            <label className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Duration</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className={cn(fieldClass, 'w-24')}
                  value={runTime}
                  onChange={(e) => {
                    setInputMode('time');
                    setRunTime(Number(e.target.value));
                  }}
                />
                <span className="text-[10px] text-slate-400">h · ~{depth}mm</span>
              </div>
            </label>
          )}
          {recentStats.etcDeficit > 0 && (
            <p className="text-[11px] text-slate-500 pb-1">
              Covers ~{Math.round(Math.min(100, (depth / recentStats.etcDeficit) * 100))}% of 7d ETc deficit
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={fertigation}
            onChange={(e) => setFertigation(e.target.checked)}
            className="rounded border-slate-300"
          />
          Fertigation note
        </label>
        {fertigation && (
          <div className="grid grid-cols-2 gap-2">
            <select
              className={fieldClass}
              value={fertilizerType}
              onChange={(e) => setFertilizerType(e.target.value)}
            >
              <option>UAN-32</option>
              <option>KTS</option>
              <option>CAN-17</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="number"
                className={cn(fieldClass, 'w-full')}
                value={injectionRate}
                onChange={(e) => setInjectionRate(Number(e.target.value))}
              />
              <span className="text-[10px] text-slate-400 shrink-0">L</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleLogIrrigation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold"
          >
            <Droplets className="w-3.5 h-3.5" />
            Log to diary
          </button>
          {loggedFlash && (
            <span className="text-[11px] font-medium text-emerald-600 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Recent runs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-sky-600" />
            Recent irrigation
          </h2>
          <Link to="/diary" className="text-[11px] font-semibold text-sky-700 hover:text-sky-900">
            All in diary
          </Link>
        </div>
        {recentIrrigation.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400">No irrigation logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Block</th>
                  <th className="px-3 py-2 text-right">mm</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 hidden sm:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentIrrigation.map((event, idx) => (
                  <tr key={`${event.date}-${idx}`} className="text-slate-700">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {new Date(event.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[120px]">
                      {event.notes?.split('Irrigated ')[1]?.split(' via')[0] || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-sky-700">
                      {event.irrigationAmount || 0}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {Math.round((event.durationMinutes || 0) / 60)}
                    </td>
                    <td className="px-3 py-2 text-slate-400 truncate max-w-[200px] hidden sm:table-cell">
                      {event.notes || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Season planner — workshop tool */}
      {showPlanner && (
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
                onChange={(e) => setChartLocation(e.target.value)}
                className={fieldClass}
              >
                {WALNUT_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className={fieldClass}
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
                    className={cn(fieldClass, 'flex-1')}
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
                  className={cn(fieldClass, 'w-full mb-2')}
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
                className={cn(fieldClass, 'w-full')}
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
                  className={cn(fieldClass, 'w-24')}
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
                const displayValue =
                  irrigationUnit === 'ML' && farmSize > 0 ? (mmValue * farmSize) / 100 : mmValue;
                return (
                  <label key={month} className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{month}</span>
                    <input
                      type="number"
                      value={displayValue === 0 ? '' : Number(displayValue.toFixed(1))}
                      onChange={(e) => handleIrrigationInputChange(month, e.target.value)}
                      className={fieldClass}
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
      )}
    </div>
  );
}
